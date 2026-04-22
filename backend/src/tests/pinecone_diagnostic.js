// backend/src/tests/pinecone_diagnostic.js
// Diagnostic script: fetches raw Pinecone semantic search results
// and compares them to what the full pipeline returns.
//
// Usage: cd backend && node src/tests/pinecone_diagnostic.js "hard scifi world building"

require("dotenv").config();
const mongoose = require("mongoose");
const { embedText } = require("../services/embeddingService");
const { getIndex, isPineconeConfigured } = require("../services/pineconeClient");
const Book = require("../models/Book");

const QUERY = process.argv[2] || "hard scifi world building";
const TOP_K = 20;

async function main() {
  console.log(`\n🔍 Diagnostic for query: "${QUERY}"\n`);

  // ── Connect to MongoDB ──────────────────────────────────────────────────
  await mongoose.connect(process.env.MONGO_URI);
  console.log("✅ MongoDB connected\n");

  // ── 1. Generate query embedding ─────────────────────────────────────────
  console.log("⏳ Generating query embedding (RETRIEVAL_QUERY mode)...");
  const queryEmb = await embedText(QUERY, "RETRIEVAL_QUERY");
  if (!queryEmb || queryEmb.length === 0) {
    console.error("❌ Failed to generate query embedding — aborting.");
    process.exit(1);
  }
  console.log(`✅ Query embedding: ${queryEmb.length} dimensions\n`);

  // ── 2. Query Pinecone DIRECTLY (no re-ranking, no genre filtering) ─────
  if (!isPineconeConfigured()) {
    console.error("❌ Pinecone not configured. Set PINECONE_API_KEY and PINECONE_INDEX_NAME.");
    process.exit(1);
  }

  console.log(`⏳ Querying Pinecone (top ${TOP_K})...`);
  const index = getIndex();
  const pineconeResults = await index.query({
    vector: queryEmb,
    topK: TOP_K,
    includeMetadata: true,
  });

  console.log(`\n${"═".repeat(80)}`);
  console.log(`RAW PINECONE RESULTS (top ${TOP_K}) for: "${QUERY}"`);
  console.log(`${"═".repeat(80)}\n`);

  if (!pineconeResults.matches || pineconeResults.matches.length === 0) {
    console.log("  (no matches found)\n");
  } else {
    for (let i = 0; i < pineconeResults.matches.length; i++) {
      const match = pineconeResults.matches[i];
      const meta = match.metadata || {};
      console.log(`  #${(i + 1).toString().padStart(2)}  Score: ${match.score.toFixed(4)}`);
      console.log(`       Title:  ${meta.title || "(unknown)"}`);
      console.log(`       Author: ${meta.author || "(unknown)"}`);
      console.log(`       Genres: ${meta.genres || "(none)"}`);
      console.log(`       Diff:   ${meta.difficultyLevel || "(none)"}`);
      console.log();
    }
  }

  // ── 3. Cross-reference with MongoDB to see full book data ───────────────
  const mongoIds = (pineconeResults.matches || []).map(m => m.id);
  const mongoBooks = await Book.find({ _id: { $in: mongoIds } })
    .select("title author genres aiSummary.themes aiSummary.keywords aiSummary.short description")
    .lean();

  const bookMap = new Map(mongoBooks.map(b => [b._id.toString(), b]));

  console.log(`${"═".repeat(80)}`);
  console.log(`ENRICHED RESULTS (with MongoDB themes/keywords)`);
  console.log(`${"═".repeat(80)}\n`);

  for (let i = 0; i < (pineconeResults.matches || []).length; i++) {
    const match = pineconeResults.matches[i];
    const book = bookMap.get(match.id);
    if (!book) {
      console.log(`  #${(i + 1).toString().padStart(2)}  [MongoDB book not found: ${match.id}]`);
      continue;
    }

    const themes = book.aiSummary?.themes || [];
    const keywords = book.aiSummary?.keywords || [];

    console.log(`  #${(i + 1).toString().padStart(2)}  Score: ${match.score.toFixed(4)} | "${book.title}" by ${book.author}`);
    console.log(`       Genres:   [${(book.genres || []).join(", ")}]`);
    console.log(`       Themes:   [${themes.join(", ")}]`);
    console.log(`       Keywords: [${keywords.join(", ")}]`);
    console.log(`       Desc:     ${(book.description || "").slice(0, 120)}...`);
    console.log();
  }

  // ── 4. Analysis: check for genre-bias ───────────────────────────────────
  console.log(`${"═".repeat(80)}`);
  console.log(`ANALYSIS`);
  console.log(`${"═".repeat(80)}\n`);

  const genreCounts = {};
  for (const match of (pineconeResults.matches || [])) {
    const book = bookMap.get(match.id);
    for (const g of (book?.genres || [])) {
      genreCounts[g] = (genreCounts[g] || 0) + 1;
    }
  }
  const sortedGenres = Object.entries(genreCounts).sort((a, b) => b[1] - a[1]);
  console.log("  Genre distribution in results:");
  for (const [g, count] of sortedGenres) {
    console.log(`    ${count}x  ${g}`);
  }

  // Check what the embedding text looks like for the top result
  const topBook = bookMap.get(pineconeResults.matches?.[0]?.id);
  if (topBook) {
    const { buildBookText } = require("../services/embeddingService");
    const embText = buildBookText(topBook);
    console.log(`\n  ── Embedding text for top result: "${topBook.title}" ──`);
    console.log(`  ${embText.slice(0, 500)}...`);
  }

  await mongoose.disconnect();
  console.log("\n✅ Done.");
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
