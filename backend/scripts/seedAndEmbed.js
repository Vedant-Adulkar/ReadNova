#!/usr/bin/env node
// backend/scripts/seedAndEmbed.js
//
// ONE-TIME ingestion: fetches books from Google Books API, deduplicates,
// generates Gemini embeddings, and upserts to MongoDB + Pinecone.
//
// Uses its OWN embedding logic (bypasses embeddingService circuit breaker)
// with retry + exponential backoff for reliable bulk embedding.
//
// Usage:
//   node scripts/seedAndEmbed.js          # first run (skips if already done)
//   node scripts/seedAndEmbed.js --force  # re-run (overwrites everything)

require("dotenv").config();

const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const Book = require("../src/models/Book");
const { getIndex, isPineconeConfigured } = require("../src/services/pineconeClient");

// ─── Config ──────────────────────────────────────────────────────────────────
const FLAG_FILE = path.join(__dirname, ".seed_done");
const GOOGLE_API = "https://www.googleapis.com/books/v1/volumes";
const EMBEDDING_MODEL = "gemini-embedding-001";
const EMBED_DIMENSIONS = 768;
const PINECONE_BATCH_SIZE = 50; // Upsert to Pinecone in batches of 50
const PAGES_PER_QUERY = 3;     // 3 pages × 40 results per query
const FETCH_DELAY_MS = 400;    // Delay between Google Books API calls
const PER_BOOK_DELAY_MS = 300; // Delay between individual embedding calls
const COOLDOWN_EVERY = 15;     // Every N books, take a longer cooldown
const COOLDOWN_MS = 5000;      // 5s cooldown

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── Diverse search queries ─────────────────────────────────────────────────
const QUERIES = [
  // Popular fiction
  "fiction bestsellers", "literary fiction novels", "contemporary fiction",
  "fantasy novels", "epic fantasy series", "urban fantasy",
  "science fiction", "space opera sci-fi", "cyberpunk dystopian",
  "mystery detective novels", "thriller suspense", "psychological thriller",
  "romance novels", "historical romance", "romantic comedy books",
  "horror supernatural", "gothic horror fiction",
  // Non-fiction
  "self-help personal development", "biography autobiography memoir",
  "history world history", "popular science books", "philosophy books",
  "business entrepreneurship", "psychology behavioral science",
  "technology programming", "art design books",
  // Young adult & children
  "young adult fantasy", "young adult dystopian", "children adventure books",
  "middle grade fiction",
  // Classics
  "classic literature", "classic novels 19th century",
  // Niche (pokemon, anime, etc.)
  "pokemon adventure", "pokemon manga", "pokemon guide",
  "anime manga books", "anime fantasy creatures",
  "monster battle fantasy", "magic creatures adventure",
  "comic books graphic novels", "superhero comics",
  "video game fiction", "gaming fantasy books",
  // Additional
  "cooking food books", "travel adventure books",
  "true crime books", "sports biography",
  "poetry collection", "spiritual mindfulness",
];

// ─── Deduplication ───────────────────────────────────────────────────────────
const seenIds = new Set();
const seenTitles = new Set();

function isDuplicate(volume) {
  const id = volume.id;
  const title = (volume.volumeInfo?.title || "").toLowerCase().trim();
  if (!id || !title) return true;
  if (seenIds.has(id) || seenTitles.has(title)) return true;
  seenIds.add(id);
  seenTitles.add(title);
  return false;
}

// ─── Build rich text for embedding ───────────────────────────────────────────
function buildRichText(info) {
  const title = info.title || "";
  const authors = (info.authors || []).join(", ");
  const categories = (info.categories || []).join(", ");
  const description = (info.description || "").replace(/<[^>]*>/g, "").slice(0, 2000);
  return [
    `Title: ${title}`,
    authors ? `Authors: ${authors}` : "",
    categories ? `Categories: ${categories}` : "",
    description ? `Description: ${description}` : "",
    categories || title ? `Keywords: ${categories}, ${title}, books like ${title}` : "",
    description ? `Context: This is a book about ${categories} themes, similar to ${title}, involving ${description.slice(0, 200)}.` : "",
  ].filter(Boolean).join("\n\n");
}

// ─── Normalise Google Books volume ───────────────────────────────────────────
function normaliseVolume(volume) {
  const info = volume.volumeInfo || {};
  const images = info.imageLinks || {};

  let coverImage = null;
  if (images.thumbnail) {
    coverImage = images.thumbnail.replace(/^http:\/\//i, "https://").replace("zoom=1", "zoom=2").replace("&edge=curl", "");
  } else if (images.smallThumbnail) {
    coverImage = images.smallThumbnail.replace(/^http:\/\//i, "https://").replace("&edge=curl", "");
  }
  if (!coverImage && volume.id) {
    coverImage = `https://books.google.com/books/content?id=${volume.id}&printsec=frontcover&img=1&zoom=2&source=gbs_api`;
  }

  const pages = info.pageCount || 0;
  let difficultyLevel = "Beginner";
  if (pages > 400) difficultyLevel = "Advanced";
  else if (pages > 200) difficultyLevel = "Intermediate";

  return {
    googleBooksId: volume.id,
    title: info.title || "Unknown Title",
    author: (info.authors || ["Unknown Author"]).join(", "),
    genres: info.categories || [],
    description: (info.description || "").replace(/<[^>]*>/g, "").slice(0, 5000),
    coverImage,
    averageRating: info.averageRating ?? 0,
    ratingsCount: info.ratingsCount ?? 0,
    difficultyLevel,
    contentRating: "General",
    source: "google_books",
  };
}

// ─── Fetch one page from Google Books API ────────────────────────────────────
async function fetchPage(query, startIndex) {
  const apiKey = process.env.GOOGLE_BOOKS_API_KEY;
  const url = new URL(GOOGLE_API);
  url.searchParams.set("q", query);
  url.searchParams.set("maxResults", "40");
  url.searchParams.set("startIndex", String(startIndex));
  url.searchParams.set("printType", "books");
  url.searchParams.set("langRestrict", "en");
  if (apiKey) url.searchParams.set("key", apiKey);

  const res = await fetch(url.toString());
  if (!res.ok) {
    console.warn(`  ⚠️  Google Books ${res.status} for "${query}" page ${startIndex / 40}`);
    return [];
  }
  const data = await res.json();
  return data.items || [];
}

// ─── Direct Gemini embedding with retry + exponential backoff ────────────────
let geminiModel = null;

function getGeminiModel() {
  if (!geminiModel) {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    geminiModel = genAI.getGenerativeModel({ model: EMBEDDING_MODEL });
  }
  return geminiModel;
}

async function embedWithGrok(text) {
  if (!process.env.XAI_API_KEY || process.env.XAI_API_KEY.includes("your-api-key")) return null;
  try {
    const response = await fetch("https://api.x.ai/v1/embeddings", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.XAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        input: text.slice(0, 8000),
        model: "grok-2-embedding",
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) return null;

    const data = await response.json();
    let vector = data?.data?.[0]?.embedding;
    if (Array.isArray(vector) && vector.length > 0) {
      // Truncate to 768
      return vector.slice(0, 768);
    }
    return null;
  } catch (err) {
    console.warn(`  ⚠️  Grok fallback error: ${err.message}`);
    return null;
  }
}

async function embedWithRetry(text, maxRetries = 4) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const model = getGeminiModel();
      const result = await model.embedContent({
        content: { parts: [{ text }] },
        taskType: "RETRIEVAL_DOCUMENT",
        outputDimensionality: EMBED_DIMENSIONS,
      });
      const vec = result.embedding?.values;
      if (vec && vec.length > 0) return vec;
      return null;
    } catch (err) {
      const isRateLimit = err.message?.includes("429") ||
                          err.message?.includes("quota") ||
                          err.message?.includes("rate") ||
                          err.message?.includes("RESOURCE_EXHAUSTED");

      if (isRateLimit && attempt < maxRetries) {
        const wait = Math.min(30000 * Math.pow(2, attempt), 120000); // 30s, 60s, 120s
        console.log(`  ⏳ Rate limited. Waiting ${wait / 1000}s (attempt ${attempt + 1}/${maxRetries})...`);
        await sleep(wait);
      } else if (attempt < maxRetries) {
        const wait = 3000 * (attempt + 1);
        console.warn(`  ⚠️  Embed error: ${err.message}. Retrying in ${wait / 1000}s...`);
        await sleep(wait);
      } else {
        console.warn(`  ❌ Embed failed after ${maxRetries} retries: ${err.message}`);
        console.log("  🔄 Attempting final Grok fallback...");
        return await embedWithGrok(text);
      }
    }
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════════
async function run() {
  const forceMode = process.argv.includes("--force");

  // ── Check flag file ────────────────────────────────────────────────────────
  if (!forceMode && fs.existsSync(FLAG_FILE)) {
    const meta = JSON.parse(fs.readFileSync(FLAG_FILE, "utf8"));
    console.log(`ℹ️  Already seeded on ${meta.seededAt} (${meta.count} books). Use --force to re-run.`);
    process.exit(0);
  }

  // ── Validate environment ──────────────────────────────────────────────────
  if (!process.env.MONGO_URI) { console.error("❌ MONGO_URI missing"); process.exit(1); }
  if (!process.env.GEMINI_API_KEY) { console.error("❌ GEMINI_API_KEY missing"); process.exit(1); }
  if (!isPineconeConfigured()) { console.error("❌ PINECONE not configured"); process.exit(1); }

  await mongoose.connect(process.env.MONGO_URI);
  console.log("✅ Connected to MongoDB\n");

  // ══════════════════════════════════════════════════════════════════════════
  // PHASE 1: Fetch books from Google Books API
  // ══════════════════════════════════════════════════════════════════════════
  console.log("═══ PHASE 1: Fetching books from Google Books ═══\n");

  const allVolumes = [];

  for (let qi = 0; qi < QUERIES.length; qi++) {
    const query = QUERIES[qi];
    let queryCount = 0;

    for (let page = 0; page < PAGES_PER_QUERY; page++) {
      const items = await fetchPage(query, page * 40);
      if (items.length === 0) break;

      for (const vol of items) {
        if (!isDuplicate(vol)) {
          allVolumes.push(vol);
          queryCount++;
        }
      }
      await sleep(FETCH_DELAY_MS);
    }

    console.log(`  [${qi + 1}/${QUERIES.length}] "${query}" → ${queryCount} new (total: ${allVolumes.length})`);
  }

  console.log(`\n📚 Fetched ${allVolumes.length} unique books\n`);

  if (allVolumes.length === 0) {
    console.error("❌ No books fetched. Check GOOGLE_BOOKS_API_KEY.");
    process.exit(1);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PHASE 2: Embed SEQUENTIALLY + upsert to MongoDB & Pinecone
  // ══════════════════════════════════════════════════════════════════════════
  console.log("═══ PHASE 2: Embedding + upserting (sequential) ═══\n");

  const index = getIndex();
  let processed = 0;
  let failed = 0;
  let skipped = 0;
  let resumed = 0;
  let pineconeBatch = [];

  for (let i = 0; i < allVolumes.length; i++) {
    const volume = allVolumes[i];
    const info = volume.volumeInfo || {};
    const bookData = normaliseVolume(volume);

    // Skip books with no meaningful text
    if (!info.description && !(info.title && info.categories)) {
      skipped++;
      continue;
    }

    // Resume mode: skip books already embedded in MongoDB
    try {
      const existing = await Book.findOne(
        { googleBooksId: bookData.googleBooksId, embeddingStatus: "done" },
        { _id: 1 }
      ).lean();
      if (existing) {
        resumed++;
        continue;
      }
    } catch (_) { /* proceed to embed if check fails */ }

    // Generate embedding (with retry + backoff)
    const richText = buildRichText(info);
    const embedding = await embedWithRetry(richText);

    if (!embedding) {
      failed++;
      continue;
    }

    // Upsert to MongoDB
    try {
      await Book.findOneAndUpdate(
        { googleBooksId: bookData.googleBooksId },
        { ...bookData, embedding, embeddingStatus: "done" },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    } catch (err) {
      console.warn(`  ⚠️  MongoDB error for "${bookData.title}": ${err.message}`);
      failed++;
      continue;
    }

    // Queue for Pinecone batch
    pineconeBatch.push({
      id: bookData.googleBooksId,
      values: embedding,
      metadata: {
        title: bookData.title,
        author: bookData.author,
        genres: (bookData.genres || []).join(", "),
        description: (bookData.description || "").slice(0, 500),
        difficultyLevel: bookData.difficultyLevel,
        contentRating: bookData.contentRating,
        coverImage: bookData.coverImage || "",
        googleBooksId: bookData.googleBooksId,
      },
    });

    processed++;

    // Flush Pinecone batch when full
    if (pineconeBatch.length >= PINECONE_BATCH_SIZE) {
      try {
        await index.upsert(pineconeBatch);
        console.log(`  📍 Pinecone: upserted ${pineconeBatch.length} vectors`);
      } catch (err) {
        console.error(`  ⚠️  Pinecone upsert error: ${err.message}`);
      }
      pineconeBatch = [];
    }

    // Progress log
    const total = processed + failed + skipped + resumed;
    if (processed % 10 === 0 || total === allVolumes.length) {
      console.log(`  ✅ ${processed} embedded | ${resumed} resumed | ${failed} failed | ${skipped} skipped (${total}/${allVolumes.length})`);
    }

    // Rate limiting: per-book delay + periodic cooldown
    await sleep(PER_BOOK_DELAY_MS);
    if (processed % COOLDOWN_EVERY === 0) {
      console.log(`  ⏳ Cooldown ${COOLDOWN_MS / 1000}s...`);
      await sleep(COOLDOWN_MS);
    }
  }

  // Flush remaining Pinecone vectors
  if (pineconeBatch.length > 0) {
    try {
      await index.upsert(pineconeBatch);
      console.log(`  📍 Pinecone: upserted final ${pineconeBatch.length} vectors`);
    } catch (err) {
      console.error(`  ⚠️  Final Pinecone upsert error: ${err.message}`);
    }
  }

  // ── Write flag file ────────────────────────────────────────────────────────
  const meta = {
    seededAt: new Date().toISOString(),
    count: processed,
    resumed,
    failed,
    skipped,
    totalFetched: allVolumes.length,
    queries: QUERIES.length,
  };
  fs.writeFileSync(FLAG_FILE, JSON.stringify(meta, null, 2));

  console.log(`\n✨ Done! Processed: ${processed} | Resumed (skipped): ${resumed} | Failed: ${failed} | Skipped: ${skipped}`);
  console.log(`📄 Flag written to ${FLAG_FILE}`);

  await mongoose.disconnect();
  process.exit(0);
}

run().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
