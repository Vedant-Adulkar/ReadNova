// backend/src/services/embeddingService.js
// Generates dense text embeddings using Google Gemini's text-embedding-004 model.
//
// Architecture:
//  - embedText(text)               → number[]  (single embedding)
//  - embedBooksInBatches(books)    → bulk-updates all book documents in MongoDB
//
// Resilience:
//  - Reuses the same circuit-breaker approach as geminiService.js
//  - Falls back to empty array [] on any failure so the rest of the engine
//    can still run (cold-start / text-search fallback paths)

const { GoogleGenerativeAI } = require("@google/generative-ai");
const Book = require("../models/Book");
const { getIndex, isPineconeConfigured } = require("./pineconeClient");

// ─── Constants ───────────────────────────────────────────────────────────────
const EMBEDDING_MODEL = "gemini-embedding-001";  // 768-dim; stable replacement for text-embedding-004
const BATCH_SIZE = 20;                           // Books per batch (API rate limit)
const BATCH_DELAY_MS = 1200;                     // Delay between batches (ms)
const TIMEOUT_MS = 8000;                         // Per-call hard timeout

// ─── Lazy client ─────────────────────────────────────────────────────────────
let genAI = null;
const getClient = () => {
  if (!genAI) {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY is not set");
    }
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  }
  return genAI;
};

// ─── Circuit-breaker (isolated from geminiService's breaker) ─────────────────
const breaker = {
  state: "CLOSED",   // CLOSED | OPEN | HALF_OPEN
  failures: 0,
  lastFailureTime: null,
};
const FAILURE_THRESHOLD = 3;
const RECOVERY_MS = 2 * 60 * 1000; // 2 minutes

const isBreakerOpen = () => {
  if (breaker.state === "OPEN") {
    if (Date.now() - breaker.lastFailureTime >= RECOVERY_MS) {
      breaker.state = "HALF_OPEN";
      console.log("🔄 Embedding circuit: HALF_OPEN — allowing recovery call.");
      return false;
    }
    return true;
  }
  return false;
};

const recordSuccess = () => {
  breaker.failures = 0;
  if (breaker.state !== "CLOSED") {
    breaker.state = "CLOSED";
    console.log("✅ Embedding circuit: CLOSED — recovered.");
  }
};

const recordFailure = () => {
  breaker.failures += 1;
  breaker.lastFailureTime = Date.now();
  if (breaker.failures >= FAILURE_THRESHOLD) {
    breaker.state = "OPEN";
    console.error(
      `🚨 Embedding circuit: OPEN after ${breaker.failures} failures. ` +
      `Suspended for ${RECOVERY_MS / 60000} min.`
    );
  }
};

// ─── Helper: sleep ────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

// ─── Core: embed a single text string ────────────────────────────────────────
/**
 * embedText — generates a dense embedding vector for the given text.
 *
 * @param {string} text   - The text to embed (book description, query, etc.)
 * @returns {Promise<number[]>}  768-dimensional vector, or [] on failure
 */
const embedText = async (text) => {
  if (!text || !text.trim()) return [];

  if (isBreakerOpen()) {
    console.warn("⚡ Embedding circuit open — skipping, returning [].");
    return [];
  }

  try {
    const model = getClient().getGenerativeModel({ model: EMBEDDING_MODEL });

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("EMBED_TIMEOUT")), TIMEOUT_MS)
    );

    const result = await Promise.race([
      model.embedContent(text.slice(0, 8000)), // Safety trim
      timeoutPromise,
    ]);

    const embedding = result?.embedding?.values;
    if (!embedding || !Array.isArray(embedding) || embedding.length === 0) {
      throw new Error("Empty embedding returned from API");
    }

    recordSuccess();
    return embedding;
  } catch (error) {
    if (error.message === "EMBED_TIMEOUT") {
      console.warn("⏱  Embedding request timed out.");
    } else if (
      error.message?.includes("429") ||
      error.message?.toLowerCase().includes("quota")
    ) {
      console.error("🚦 Embedding quota exhausted.");
    } else {
      console.error("❌ Embedding error:", error.message);
    }
    recordFailure();
    return [];
  }
};

// ─── Build the text to embed for a book ──────────────────────────────────────
/**
 * buildBookText — concatenates the most semantically rich fields of a book
 * into a single string for embedding.
 *
 * @param {object} book
 * @returns {string}
 */
const buildBookText = (book) => {
  const parts = [
    book.title ? `Title: ${book.title}` : "",
    book.author ? `Author: ${book.author}` : "",
    book.genres?.length ? `Genres: ${book.genres.join(", ")}` : "",
    book.difficultyLevel ? `Level: ${book.difficultyLevel}` : "",
    book.description ? `Description: ${book.description}` : "",
  ];
  return parts.filter(Boolean).join(". ");
};

// ─── Bulk book embedding ──────────────────────────────────────────────────────
/**
 * embedBooksInBatches — embeds every Book in the database (in batches to
 * stay within rate limits) and persists the resulting vector to MongoDB.
 *
 * @param {object}  [options]
 * @param {boolean} [options.overwrite=false]  If true, re-embeds books that
 *                  already have a non-empty embedding vector.
 * @returns {Promise<{ processed: number, failed: number, skipped: number }>}
 */
const embedBooksInBatches = async ({ overwrite = false } = {}) => {
  const query = overwrite ? {} : { $or: [{ embedding: { $size: 0 } }, { embedding: { $exists: false } }] };
  const books = await Book.find(query).lean();

  console.log(`📚 Starting embedding for ${books.length} books (overwrite=${overwrite})...`);

  const usePinecone = isPineconeConfigured();
  if (usePinecone) {
    console.log("📍 Pinecone configured — vectors will be upserted.");
  } else {
    console.log("ℹ️  Pinecone not configured — storing embeddings in MongoDB only.");
  }

  let processed = 0;
  let failed = 0;
  const skipped = 0;

  for (let i = 0; i < books.length; i += BATCH_SIZE) {
    const batch = books.slice(i, i + BATCH_SIZE);
    const pineconeBatch = [];

    await Promise.all(
      batch.map(async (book) => {
        const text = buildBookText(book);
        const embedding = await embedText(text);

        if (embedding.length > 0) {
          // Always persist to MongoDB
          await Book.findByIdAndUpdate(book._id, { embedding });
          processed += 1;
          console.log(`  ✅ [${processed}/${books.length}] Embedded: "${book.title}"`);

          // Queue for Pinecone upsert if configured
          if (usePinecone) {
            pineconeBatch.push({
              id: book._id.toString(),
              values: embedding,
              metadata: {
                title: book.title || "",
                author: book.author || "",
                genres: (book.genres || []).join(", "),
                difficultyLevel: book.difficultyLevel || "",
                contentRating: book.contentRating || "General",
              },
            });
          }
        } else {
          failed += 1;
          console.warn(`  ❌ Failed to embed: "${book.title}"`);
        }
      })
    );

    // Upsert whole batch to Pinecone in one call
    if (usePinecone && pineconeBatch.length > 0) {
      try {
        await getIndex().upsert(pineconeBatch);
        console.log(`  📍 Upserted ${pineconeBatch.length} vectors to Pinecone.`);
      } catch (err) {
        console.error(`  ⚠️  Pinecone upsert failed: ${err.message}`);
      }
    }

    // Rate-limit delay between batches (skip delay after last batch)
    if (i + BATCH_SIZE < books.length) {
      console.log(`  ⏳ Batch done. Waiting ${BATCH_DELAY_MS}ms before next batch...`);
      await sleep(BATCH_DELAY_MS);
    }
  }

  console.log(`\n✨ Embedding complete. Processed: ${processed}, Failed: ${failed}, Skipped: ${skipped}`);
  return { processed, failed, skipped };
};

// ─── Background: persist + embed Google Books results ─────────────────────────
/**
 * persistAndEmbedGoogleBooks
 *
 * Saves Google Books API results to MongoDB and immediately generates an
 * embedding for each new or previously-unembedded book.
 * Designed to run fire-and-forget (.catch() at the call site).
 *
 * Deduplication is done via googleBooksId (the stable Google volume ID) which
 * is already an indexed field on the Book schema.
 *
 * @param {object[]} googleBooks - Normalised books from googleBooksService
 * @returns {Promise<void>}
 */
const persistAndEmbedGoogleBooks = async (googleBooks) => {
  if (!Array.isArray(googleBooks) || googleBooks.length === 0) return;

  for (const gb of googleBooks) {
    try {
      // Skip items missing a Google volume ID
      if (!gb.googleBooksId) continue;

      let book = await Book.findOne({ googleBooksId: gb.googleBooksId });

      if (book) {
        // Already in DB — embed only if the embedding is missing
        if (!book.embedding || book.embedding.length === 0) {
          const vector = await embedText(buildBookText(book));
          if (vector.length > 0) {
            book.embedding = vector;
            await book.save();
            console.log(`✅ Re-embedded existing Google book: "${book.title}"`);
          }
        }
        continue;
      }

      // New book — create document from the normalised Google Books shape
      book = new Book({
        title: gb.title,
        author: gb.author,
        description: gb.description || "",
        genres: gb.genres || [],
        difficultyLevel: gb.difficultyLevel || "Intermediate",
        coverImage: gb.coverImage || "",
        averageRating: gb.averageRating || 0,
        ratingsCount: gb.ratingsCount || 0,
        contentRating: "General",
        googleBooksId: gb.googleBooksId,
        source: "google_books",
      });

      const vector = await embedText(buildBookText(book));
      if (vector.length > 0) {
        book.embedding = vector;
      }

      await book.save();
      console.log(`✅ Saved + embedded Google book: "${book.title}"`);
    } catch (err) {
      console.error(`❌ persistAndEmbedGoogleBooks failed for "${gb.title}":`, err.message);
    }
  }
};

// ─── Exports ──────────────────────────────────────────────────────────────────
module.exports = { embedText, embedBooksInBatches, buildBookText, persistAndEmbedGoogleBooks };
