#!/usr/bin/env node
// backend/scripts/embedAllBooks.js
//
// One-time script: generates Gemini embeddings for every book in MongoDB
// and upserts the vectors into Pinecone.
//
// Usage (from backend/ directory):
//   node scripts/embedAllBooks.js            # only books without embeddings
//   node scripts/embedAllBooks.js --overwrite # re-embed everything
//
// Prerequisites:
//   - PINECONE_API_KEY and PINECONE_INDEX_NAME set in backend/.env
//   - Pinecone index created: dimension=768, metric=cosine

require("dotenv").config();

const mongoose = require("mongoose");
const Book = require("../src/models/Book");
const { embedText, buildBookText } = require("../src/services/embeddingService");
const { getIndex, isPineconeConfigured } = require("../src/services/pineconeClient");

const BATCH_SIZE = 20;      // Pinecone upsert batch size
const EMBED_DELAY_MS = 1200; // Rate-limit delay between Gemini batches

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function run() {
  // ── Validate environment ──────────────────────────────────────────────────
  if (!isPineconeConfigured()) {
    console.error("❌  PINECONE_API_KEY or PINECONE_INDEX_NAME is missing. Aborting.");
    process.exit(1);
  }

  // ── Connect to MongoDB ─────────────────────────────────────────────────────
  if (!process.env.MONGO_URI) {
    console.error("❌️  MONGO_URI is missing. Aborting.");
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGO_URI);
  console.log("✅  Connected to MongoDB");

  const overwrite = process.argv.includes("--overwrite");
  const query = overwrite
    ? {}
    : { $or: [{ embedding: { $size: 0 } }, { embedding: { $exists: false } }] };

  const books = await Book.find(query).lean();
  console.log(`📚  Found ${books.length} books to embed (overwrite=${overwrite})\n`);

  if (books.length === 0) {
    console.log("ℹ️  All books already have embeddings. Use --overwrite to re-embed.");
    process.exit(0);
  }

  const index = getIndex();
  let processed = 0;
  let failed = 0;

  // ── Process in batches ────────────────────────────────────────────────────
  for (let i = 0; i < books.length; i += BATCH_SIZE) {
    const batch = books.slice(i, i + BATCH_SIZE);
    const pineconeBatch = [];

    await Promise.all(
      batch.map(async (book) => {
        const text = buildBookText(book);
        const embedding = await embedText(text);

        if (embedding.length === 0) {
          console.warn(`  ⚠️  Failed to embed: "${book.title}"`);
          failed++;
          return;
        }

        // Persist vector in MongoDB (keeps the local copy in sync)
        await Book.findByIdAndUpdate(book._id, { embedding });

        // Queue for Pinecone upsert
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

        processed++;
        console.log(`  ✅ [${processed + failed}/${books.length}] "${book.title}"`);
      })
    );

    // Upsert the whole batch to Pinecone at once
    if (pineconeBatch.length > 0) {
      await index.upsert(pineconeBatch);
    }

    // Rate-limit Gemini embedding calls
    if (i + BATCH_SIZE < books.length) {
      console.log(`  ⏳ Waiting ${EMBED_DELAY_MS}ms before next batch...\n`);
      await sleep(EMBED_DELAY_MS);
    }
  }

  console.log(`\n✨  Done!  Processed: ${processed}  Failed: ${failed}`);
  await mongoose.disconnect();
  process.exit(0);
}

run().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
