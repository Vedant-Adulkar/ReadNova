// backend/src/services/embeddingService.js
// Generates dense text embeddings using Google Gemini's embedding model.
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
// Only counts REAL failures (500s, timeouts, empty responses).
// Rate-limit (429) errors are handled by retry/backoff, NOT by the breaker.
const breaker = {
  state: "CLOSED",   // CLOSED | OPEN | HALF_OPEN
  failures: 0,
  lastFailureTime: null,
};
const FAILURE_THRESHOLD = 5;          // Real failures before opening
const RECOVERY_MS = 2 * 60 * 1000;   // 2 minutes

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
      `🚨 Embedding circuit: OPEN after ${breaker.failures} real failures. ` +
      `Suspended for ${RECOVERY_MS / 60000} min.`
    );
  }
};

// ─── Helper: sleep ────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

// ─── Rate-limit detection ─────────────────────────────────────────────────────
const isRateLimitError = (error) => {
  const msg = error?.message || "";
  return msg.includes("429") ||
    msg.toLowerCase().includes("quota") ||
    msg.toLowerCase().includes("rate limit") ||
    msg.toLowerCase().includes("resource has been exhausted");
};

// ─── Core: embed a single text string ────────────────────────────────────────
// Retry config for 429 errors
const MAX_RETRIES = 4;              // Up to 4 retries on rate-limit
const INITIAL_BACKOFF_MS = 5000;    // Start at 5s, then 10s, 20s, 40s

/**
 * embedText — generates a dense embedding vector for the given text.
 *
 * On 429 (rate-limit) errors: retries with exponential backoff (5s → 10s → 20s → 40s).
 * On real errors (500s, timeouts): counts against the circuit breaker.
 *
 * @param {string} text       - The text to embed (book description, query, etc.)
 * @param {string} [taskType] - Gemini task type: 'RETRIEVAL_DOCUMENT' (default) or 'RETRIEVAL_QUERY'
 * @returns {Promise<number[]>}  768-dimensional vector, or [] on failure
 */
const embedText = async (text, taskType = 'RETRIEVAL_DOCUMENT') => {
  if (!text || !text.trim()) return [];

  if (isBreakerOpen()) {
    console.warn("⚡ Embedding circuit open — skipping, returning [].");
    return [];
  }

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const model = getClient().getGenerativeModel({ model: EMBEDDING_MODEL });

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("EMBED_TIMEOUT")), TIMEOUT_MS)
      );

      const result = await Promise.race([
        model.embedContent({
          content: { parts: [{ text: text.slice(0, 8000) }], role: 'user' },
          taskType,
          outputDimensionality: 768,
        }),
        timeoutPromise,
      ].filter(Boolean));

      const embedding = result?.embedding?.values;
      if (!embedding || !Array.isArray(embedding) || embedding.length === 0) {
        throw new Error("Empty embedding returned from API");
      }

      recordSuccess();
      return embedding;
    } catch (error) {
      // ── Rate-limit: retry with backoff (NOT a circuit breaker failure) ──
      if (isRateLimitError(error)) {
        if (attempt < MAX_RETRIES) {
          const waitMs = INITIAL_BACKOFF_MS * Math.pow(2, attempt);
          console.warn(`🚦 Rate-limited (attempt ${attempt + 1}/${MAX_RETRIES + 1}). Waiting ${waitMs / 1000}s...`);
          await sleep(waitMs);
          continue; // retry
        }
        console.error(`🚦 Rate-limited after ${MAX_RETRIES + 1} attempts. Giving up.`);
        // Don't count rate limits against circuit breaker — they're temporary
        return [];
      }

      // ── Real failures: count against circuit breaker ───────────────────
      if (error.message === "EMBED_TIMEOUT") {
        console.warn("⏱  Gemini embedding timed out.");
      } else {
        console.error("❌ Gemini embedding error:", error.message);
      }

      recordFailure();
      return [];
    }
  }

  return [];
};

// ─── Fiction / Non-fiction classification ─────────────────────────────────────

// Genre strings whose PRIMARY category (before "/") indicates narrative fiction
const FICTION_GENRE_PATTERNS = [
  'fiction', 'science fiction', 'fantasy', 'thriller', 'mystery',
  'horror', 'romance', 'adventure', 'historical fiction', 'literary fiction',
  'young adult', 'juvenile fiction', 'comics', 'graphic novels',
  'action', 'suspense', 'crime', 'drama',
];

/**
 * isFiction — returns true if a book is narrative fiction.
 * Checks the PRIMARY genre category (before "/") to avoid false positives
 * like "Literary Criticism / Science Fiction & Fantasy".
 *
 * @param {object} book
 * @returns {boolean}
 */
const isFiction = (book) => {
  const genres = (book.genres || []).map((g) => g.toLowerCase());
  if (genres.length === 0) {
    // No genres — check description for fiction signals
    const desc = (book.description || "").toLowerCase();
    return /\b(novel|story|character|protagonist|narrative|adventure|quest|journey)\b/.test(desc);
  }
  return genres.some((g) => {
    const primary = g.split('/')[0].trim();
    return FICTION_GENRE_PATTERNS.some((fp) => primary.includes(fp));
  });
};

// ─── Build the text to embed for a book ──────────────────────────────────────
/**
 * buildBookText — creates the text representation used for embedding.
 *
 * v3 strategy: REMOVE genre labels entirely from the embedding text.
 * Instead, prioritize:
 *   1. Title (what is this book?)
 *   2. Story/Description (what happens in it?)
 *   3. Themes + Keywords (repeated for emphasis — the core semantic signal)
 *   4. Tone + Audience (mood and target reader)
 *   5. Type: Fiction / Non-fiction (binary classifier for intent matching)
 *
 * This prevents non-fiction books with "Science" genres from embedding
 * close to science fiction queries.
 *
 * @param {object} book
 * @returns {string}
 */
const buildBookText = (book) => {
  const summary = book.aiSummary || {};
  const hasAISummary = !!(summary.short);
  const fiction = isFiction(book);

  const parts = [
    // ── Identity ──────────────────────────────────────────────────────────
    book.title  ? `Title: ${book.title}`  : "",
    book.author ? `Author: ${book.author}` : "",

    // ── Type signal (replaces raw genre labels) ──────────────────────────
    `Type: ${fiction ? "Fiction novel" : "Non-fiction"}`,

    // ── Story content (HIGHEST priority for semantic signal) ─────────────
    // Always include description for narrative grounding
    book.description ? `Story: ${book.description}` : "",

    // ── AI Summary (enriches the signal when available) ──────────────────
    hasAISummary ? `Summary: ${summary.short}` : "",
    summary.tone     ? `Tone: ${summary.tone}`       : "",
    summary.audience ? `Audience: ${summary.audience}` : "",

    // ── Themes (REPEATED for stronger semantic weight) ───────────────────
    summary.themes?.length
      ? `Themes: ${summary.themes.join(", ")}. Themes: ${summary.themes.join(", ")}`
      : "",

    // ── Keywords (REPEATED for stronger semantic weight) ─────────────────
    summary.keywords?.length
      ? `Keywords: ${summary.keywords.join(", ")}. Keywords: ${summary.keywords.join(", ")}`
      : "",
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
  const query = overwrite
    ? {}
    : {
        $or: [
          { embeddingStatus: { $in: ["none", "failed"] } },
          { embedding: { $size: 0 } },
          { embedding: { $exists: false } },
        ],
      };
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
          await Book.findByIdAndUpdate(book._id, {
            embedding,
            embeddingStatus: "done",
            embeddingVersion: "v3",
          });
          processed += 1;
          console.log(`  ✅ [${processed}/${books.length}] Embedded: "${book.title}"`);

          // Queue for Pinecone upsert if configured
          if (usePinecone) {
            pineconeBatch.push({
              id: book._id.toString(),
              values: embedding,
              metadata: buildPineconeMetadata(book),
            });
          }
        } else {
          failed += 1;
          await Book.findByIdAndUpdate(book._id, { embeddingStatus: "failed" }).catch(() => {});
          console.warn(`  ❌ Failed to embed: "${book.title}"`);
        }
      })
    );

    // Upsert whole batch to Pinecone in one call
    if (usePinecone && pineconeBatch.length > 0) {
      try {
        await getIndex().upsert({ records: pineconeBatch }); // SDK v7: requires { records: [...] }
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
        if (!book.embedding || book.embedding.length === 0 || book.embeddingStatus === "failed") {
          const vector = await embedText(buildBookText(book));
          if (vector.length > 0) {
            book.embedding = vector;
            book.embeddingStatus = "done";
            await book.save();
            console.log(`✅ Re-embedded existing Google book: "${book.title}"`);
          } else {
            book.embeddingStatus = "failed";
            await book.save();
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
        book.embeddingStatus = "done";
      } else {
        book.embeddingStatus = "failed";
      }

      await book.save();
      console.log(`✅ Saved + embedded Google book: "${book.title}"`);

      // ── Background summary removed (generation is now strictly on-demand) ────
    } catch (err) {
      console.error(`❌ persistAndEmbedGoogleBooks failed for "${gb.title}":`, err.message);
    }
  }
};

// ─── Pinecone metadata builder ───────────────────────────────────────────────
/**
 * buildPineconeMetadata — standard metadata object for Pinecone upserts.
 * Includes a `type` field ("Fiction" / "Non-fiction") for hard filtering.
 *
 * @param {object} book
 * @returns {object}
 */
const buildPineconeMetadata = (book) => ({
  title: book.title || "",
  author: book.author || "",
  genres: (book.genres || []).join(", "),
  type: isFiction(book) ? "Fiction" : "Non-fiction",
  difficultyLevel: book.difficultyLevel || "",
  contentRating: book.contentRating || "General",
});

// ─── Exports ──────────────────────────────────────────────────────────────────
module.exports = { embedText, embedBooksInBatches, buildBookText, persistAndEmbedGoogleBooks, isFiction, buildPineconeMetadata };
