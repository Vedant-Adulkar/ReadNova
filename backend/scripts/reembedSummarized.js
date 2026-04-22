#!/usr/bin/env node
// backend/scripts/reembedSummarized.js
//
// Re-embeds books that have AI summaries but whose embeddings haven't
// been updated to include the summary text. Processes ONE book at a time
// with aggressive delays to avoid Gemini rate limits.
//
// Marks re-embedded books as "v3-enriched" to distinguish from the
// original "v3" embeddings that were made without summary content.
//
// Usage:
//   node scripts/reembedSummarized.js             # only books needing enriched embedding
//   node scripts/reembedSummarized.js --all       # re-embed ALL summarized books

require("dotenv").config();

const mongoose = require("mongoose");
const Book = require("../src/models/Book");
const { embedText, buildBookText, buildPineconeMetadata } = require("../src/services/embeddingService");
const { getIndex, isPineconeConfigured } = require("../src/services/pineconeClient");

const PER_BOOK_DELAY_MS = 4000;   // 4s between books (~15 RPM)
const COOLDOWN_EVERY = 10;        // Every N books, take a longer cooldown
const COOLDOWN_MS = 15000;        // 15s cooldown
const RATE_LIMIT_PAUSE_MS = 60000; // 60s pause on rate limit

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function run() {
  if (!process.env.MONGO_URI) {
    console.error("❌ MONGO_URI missing");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);
  console.log("✅ Connected to MongoDB\n");

  const all = process.argv.includes("--all");

  // Find books with AI summaries that need (re-)embedding
  let query;
  if (all) {
    // All books with summaries
    query = {
      "aiSummary.short": { $exists: true, $ne: "" },
    };
  } else {
    // Books with summaries but NOT yet re-embedded with enriched text
    query = {
      "aiSummary.short": { $exists: true, $ne: "" },
      embeddingVersion: { $ne: "v3-enriched" },
    };
  }

  const books = await Book.find(query).lean();
  console.log(`📚 Found ${books.length} summarized books to re-embed (all=${all})\n`);

  if (books.length === 0) {
    console.log("ℹ️  All summarized books already have enriched embeddings.");
    await mongoose.disconnect();
    process.exit(0);
  }

  const usePinecone = isPineconeConfigured();
  if (usePinecone) {
    console.log("📍 Pinecone configured — vectors will be upserted.\n");
  }

  let processed = 0;
  let failed = 0;

  for (let i = 0; i < books.length; i++) {
    const book = books[i];
    const text = buildBookText(book);
    const embedding = await embedText(text);

    if (embedding.length > 0) {
      // Save to MongoDB
      await Book.findByIdAndUpdate(book._id, {
        embedding,
        embeddingStatus: "done",
        embeddingVersion: "v3-enriched",
      });
      processed++;

      // Upsert to Pinecone
      if (usePinecone) {
        try {
          await getIndex().upsert({
            records: [{
              id: book._id.toString(),
              values: embedding,
              metadata: buildPineconeMetadata(book),
            }],
          });
        } catch (err) {
          console.warn(`  ⚠️  Pinecone error for "${book.title}": ${err.message}`);
        }
      }

      console.log(`  ✅ [${i + 1}/${books.length}] "${book.title}"`);
    } else {
      failed++;
      console.warn(`  ❌ [${i + 1}/${books.length}] Failed: "${book.title}"`);

      // On failure (likely rate limit), take a longer pause
      console.log(`  ⏳ Rate-limit pause: ${RATE_LIMIT_PAUSE_MS / 1000}s...`);
      await sleep(RATE_LIMIT_PAUSE_MS);
      continue;
    }

    // Per-book delay
    await sleep(PER_BOOK_DELAY_MS);

    // Periodic cooldown
    if (processed > 0 && processed % COOLDOWN_EVERY === 0) {
      console.log(`  ⏳ Cooldown (${COOLDOWN_MS / 1000}s) after ${processed} books...`);
      await sleep(COOLDOWN_MS);
    }
  }

  console.log(`\n✨ Re-embedding complete!`);
  console.log(`   Processed: ${processed}`);
  console.log(`   Failed:    ${failed}`);
  console.log(`   Total:     ${books.length}`);

  if (failed > 0) {
    console.log(`\n💡 Re-run this script later to retry the ${failed} failed books.`);
  }

  await mongoose.disconnect();
  process.exit(0);
}

run().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
