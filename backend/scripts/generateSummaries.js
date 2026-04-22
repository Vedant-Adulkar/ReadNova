#!/usr/bin/env node
// backend/scripts/generateSummaries.js
//
// Bulk-generates AI summaries (via Gemini) for all books in MongoDB that
// don't have one yet, or re-generates all summaries when --force is passed.
//
// After each summary is generated, the book's embedding is immediately
// re-computed using the enriched text (metadata + AI summary).
//
// Usage (from backend/ directory):
//   node scripts/generateSummaries.js           # only books missing summaries
//   node scripts/generateSummaries.js --force   # regenerate all (prompt upgrade)
//
// Rate limiting:
//   - 5 books per batch
//   - 2-second delay between batches
//
// Resilience:
//   - Uses multi-provider fallback (Gemini → OpenRouter → Groq)
//   - Aborts entirely after 10 consecutive failures (all providers exhausted)

require("dotenv").config();

const mongoose = require("mongoose");
const Book = require("../src/models/Book");
const fallback = require("../src/ai/fallbackService");
const { embedText, buildBookText, buildPineconeMetadata } = require("../src/services/embeddingService");
const { getIndex, isPineconeConfigured } = require("../src/services/pineconeClient");
const { makeSummaryHash } = require("../src/services/bookService");

const BATCH_SIZE = 3;
const BATCH_DELAY_MS = 5000;            // 5s between batches — gives Groq time to breathe
const REQUEST_DELAY_MS = 3000;          // 3s between individual books — ~20 RPM safe for Groq free tier
const MAX_CONSECUTIVE_FAILURES = 15;     // Higher tolerance — rate limits are temporary
const currentVersion = fallback.SUMMARY_PROMPT_VERSION;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function run() {
  // ── Validate environment ──────────────────────────────────────────────────
  if (!process.env.MONGO_URI) {
    console.error("❌ MONGO_URI is missing. Aborting.");
    process.exit(1);
  }

  // Check at least one AI provider is configured
  const providers = fallback.getProviderStatus();
  const configured = providers.filter((p) => p.configured);
  if (configured.length === 0) {
    console.error("❌ No AI provider configured. Set at least one of: GEMINI_API_KEY, OPENROUTER_API_KEY, GROQ_API_KEY");
    process.exit(1);
  }
  console.log(`🤖 AI providers: ${configured.map((p) => p.name).join(" → ")}`);

  // ── Connect to MongoDB ─────────────────────────────────────────────────────
  await mongoose.connect(process.env.MONGO_URI);
  console.log("✅ Connected to MongoDB");

  const force = process.argv.includes("--force");
  const missingThemes = process.argv.includes("--missing-themes");
  const skipEmbed = process.argv.includes("--no-embed");

  // Books to process:
  //  --force            → all books
  //  --missing-themes   → books with empty themes/keywords (critical for embedding quality)
  //  default            → books with no short summary
  let query;
  if (force) {
    query = {};
  } else if (missingThemes) {
    query = {
      $or: [
        { "aiSummary.themes": { $size: 0 } },
        { "aiSummary.themes": { $exists: false } },
        { "aiSummary.keywords": { $size: 0 } },
        { "aiSummary.keywords": { $exists: false } },
      ],
    };
  } else {
    query = {
      $or: [
        { "aiSummary.short": "" },
        { "aiSummary.short": null },
        { "aiSummary.short": { $exists: false } },
      ],
    };
  }

  const books = await Book.find(query).lean();
  console.log(
    `📚 Found ${books.length} books to summarise (force=${force}, prompt=${currentVersion})\n`
  );

  if (books.length === 0) {
    console.log("ℹ️  All books already have current summaries. Use --force to regenerate.");
    process.exit(0);
  }

  const usePinecone = !skipEmbed && isPineconeConfigured();
  if (skipEmbed) {
    console.log("⏭️  --no-embed: skipping re-embedding (run embedAllBooks.js later).\n");
  } else if (usePinecone) {
    console.log("📍 Pinecone configured — embeddings will be upserted.\n");
  }

  let summarised = 0;
  let embedded = 0;
  let deduped = 0;
  let failed = 0;
  let consecutiveFailures = 0;

  // ── Process in batches ────────────────────────────────────────────────────
  for (let i = 0; i < books.length; i += BATCH_SIZE) {
    // ── Abort if too many consecutive failures (all providers exhausted) ──
    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      console.log(`\n❌ Aborting: ${MAX_CONSECUTIVE_FAILURES} consecutive failures.`);
      console.log("   → All AI providers are likely exhausted. Try again later.\n");
      break;
    }

    const batch = books.slice(i, i + BATCH_SIZE);

    for (const book of batch) {
      const bookNum = i + batch.indexOf(book) + 1;
      const hash = makeSummaryHash(book.title, book.author);

      // ── Dedup check: another book with same hash already has a summary ──
      const existing = await Book.findOne({
        _id: { $ne: book._id },
        summaryHash: hash,
        summaryVersion: currentVersion,
        "aiSummary.short": { $ne: "" },
      }).lean();

      let summary;

      if (existing?.aiSummary?.short) {
        // Copy from existing
        summary = existing.aiSummary;
        await Book.findByIdAndUpdate(book._id, {
          aiSummary: summary,
          summaryVersion: currentVersion,
          summaryHash: hash,
          summaryGeneratedAt: existing.summaryGeneratedAt || new Date(),
          isSummarizing: false,
        });
        deduped++;
        consecutiveFailures = 0; // Reset on success
        console.log(`  📋 [${bookNum}/${books.length}] Dedup: "${book.title}"`);
      } else {
        // Generate via multi-provider fallback (Groq → OpenRouter → Gemini)
        summary = await fallback.generateBookSummary(book);

        if (!summary || !summary.short) {
          failed++;
          consecutiveFailures++;
          console.warn(`  ❌ [${bookNum}/${books.length}] Failed: "${book.title}" (${consecutiveFailures} in a row)`);
          continue;
        }

        await Book.findByIdAndUpdate(book._id, {
          aiSummary: summary,
          summaryVersion: currentVersion,
          summaryHash: hash,
          summaryGeneratedAt: new Date(),
          isSummarizing: false,
        });
        summarised++;
        consecutiveFailures = 0; // Reset on success
        console.log(`  ✅ [${bookNum}/${books.length}] Summarised: "${book.title}"`);
      }

      // ── Re-embed with enriched text ─────────────────────────────────────
      if (!skipEmbed) {
        const updatedBook = { ...book, aiSummary: summary };
        const text = buildBookText(updatedBook);
        const embedding = await embedText(text);

        if (embedding.length > 0) {
          await Book.findByIdAndUpdate(book._id, {
            embedding,
            embeddingStatus: "done",
            embeddingVersion: "v3",
          });
          embedded++;

          // Pinecone upsert
          if (usePinecone) {
            try {
              await getIndex().upsert({
                records: [{
                  id: book._id.toString(),
                  values: embedding,
                  metadata: buildPineconeMetadata(updatedBook),
                }],
              });
            } catch (err) {
              console.warn(`  ⚠️ Pinecone upsert failed for "${book.title}":`, err.message);
            }
          }
        }
      }
      // Small delay between requests to stay within per-minute rate limits
      await sleep(REQUEST_DELAY_MS);
    }

    // Rate-limit delay between batches
    if (i + BATCH_SIZE < books.length) {
      console.log(`  ⏳ Batch done. Waiting ${BATCH_DELAY_MS}ms...\n`);
      await sleep(BATCH_DELAY_MS);
    }
  }

  console.log(`\n✨ Summary generation complete.`);
  console.log(`   Summarised:  ${summarised}`);
  console.log(`   Deduped:     ${deduped}`);
  console.log(`   Re-embedded: ${embedded}`);
  console.log(`   Failed:      ${failed}`);
  console.log(`   Remaining:   ${books.length - summarised - deduped - failed}`);

  if (failed > 0) {
    console.log(`\n💡 Tip: Run this script again later to retry the ${failed} failed books.`);
  }

  await mongoose.disconnect();
  process.exit(0);
}

run().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
