// scripts/diagnoseSearch.js
// Diagnostic script to check why semantic search isn't returning relevant space books.

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const Book = require('../src/models/Book');
const { embedText, buildBookText } = require('../src/services/embeddingService');
const cosineSimilarity = require('../src/utils/cosineSimilarity');

async function diagnose() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('✅ Connected to MongoDB\n');

  // 1. How many books are in the DB?
  const totalBooks = await Book.countDocuments();
  console.log(`📚 Total books in DB: ${totalBooks}`);

  // 2. How many have embeddings?
  const withEmbeddings = await Book.countDocuments({
    embedding: { $exists: true, $not: { $size: 0 } }
  });
  console.log(`🧮 Books with embeddings: ${withEmbeddings}`);
  console.log(`❌ Books WITHOUT embeddings: ${totalBooks - withEmbeddings}\n`);

  // 3. Find space-related books by keyword search in title/description/genres
  const spaceBooks = await Book.find({
    $or: [
      { title: { $regex: /space|galaxy|starship|astronaut|mars|planet|orbit|cosmos|interstellar/i } },
      { description: { $regex: /space exploration|space travel|astronaut|galaxy|starship|mars colony|interstellar/i } },
      { genres: { $regex: /science fiction/i } },
      { 'aiSummary.keywords': { $regex: /space|galaxy|astronaut|planet|spacecraft/i } },
      { 'aiSummary.themes': { $regex: /space|exploration|cosmos/i } },
    ]
  }).select('title author genres embedding embeddingStatus aiSummary.keywords aiSummary.themes aiSummary.short description').lean();

  console.log(`🚀 Space/sci-fi related books found (text match): ${spaceBooks.length}`);
  
  for (const book of spaceBooks.slice(0, 15)) {
    const hasEmb = Array.isArray(book.embedding) && book.embedding.length > 0;
    console.log(`  - "${book.title}" by ${book.author}`);
    console.log(`    Genres: [${(book.genres || []).join(', ')}]`);
    console.log(`    Embedding: ${hasEmb ? `✅ (${book.embedding.length} dims)` : '❌ MISSING'}`);
    console.log(`    Status: ${book.embeddingStatus || 'none'}`);
    if (book.aiSummary?.keywords?.length) {
      console.log(`    Keywords: [${book.aiSummary.keywords.join(', ')}]`);
    }
    if (book.aiSummary?.themes?.length) {
      console.log(`    Themes: [${book.aiSummary.themes.join(', ')}]`);
    }
    console.log();
  }

  // 4. Generate query embedding and test similarity
  console.log('─────────────────────────────────────────────');
  console.log('🔍 Testing query: "Beginner-friendly science fiction about space exploration"');
  console.log('─────────────────────────────────────────────\n');

  const queryText = "Beginner-friendly science fiction about space exploration";
  const queryEmbedding = await embedText(queryText, 'RETRIEVAL_QUERY');
  
  if (!queryEmbedding || queryEmbedding.length === 0) {
    console.error('❌ FAILED to generate query embedding! This is the problem.');
    await mongoose.disconnect();
    return;
  }
  console.log(`✅ Query embedding generated: ${queryEmbedding.length} dimensions\n`);

  // 5. Compute similarity for ALL books with embeddings
  const allBooksWithEmb = await Book.find({
    embedding: { $exists: true, $not: { $size: 0 } }
  }).select('title author genres embedding embeddingStatus aiSummary.keywords aiSummary.themes description').lean();

  const scored = allBooksWithEmb.map(book => {
    const sim = cosineSimilarity(queryEmbedding, book.embedding);
    return { book, similarity: sim };
  }).sort((a, b) => b.similarity - a.similarity);

  console.log('📊 TOP 20 books by cosine similarity to query:');
  console.log('─────────────────────────────────────────────');
  for (const { book, similarity } of scored.slice(0, 20)) {
    const isSpace = /space|galaxy|starship|astronaut|mars|planet|cosmos|interstellar/i.test(book.title) ||
                    /space|galaxy|astronaut|cosmos/i.test((book.aiSummary?.keywords || []).join(' '));
    const marker = isSpace ? '🚀' : '  ';
    console.log(`${marker} ${similarity.toFixed(4)} | "${book.title}" | [${(book.genres || []).join(', ')}]`);
  }

  console.log('\n📊 BOTTOM 5 books by cosine similarity:');
  for (const { book, similarity } of scored.slice(-5)) {
    console.log(`   ${similarity.toFixed(4)} | "${book.title}" | [${(book.genres || []).join(', ')}]`);
  }

  // 6. Check the dynamic threshold logic
  const topScore = scored[0]?.similarity ?? 0;
  const dynamicThreshold = Math.max(0.42, topScore - 0.08);
  const passingCount = scored.filter(r => r.similarity >= dynamicThreshold).length;
  console.log(`\n🎯 Dynamic threshold: topScore=${topScore.toFixed(4)}, threshold=${dynamicThreshold.toFixed(4)}`);
  console.log(`   Books passing threshold: ${passingCount}`);

  // 7. Check embedding dimensions consistency
  const dimCounts = new Map();
  for (const book of allBooksWithEmb) {
    const dim = book.embedding.length;
    dimCounts.set(dim, (dimCounts.get(dim) || 0) + 1);
  }
  console.log('\n🔢 Embedding dimension distribution:');
  for (const [dim, count] of dimCounts) {
    console.log(`   ${dim} dimensions: ${count} books`);
  }

  // 8. Check if space books specifically rank well
  console.log('\n🚀 Where do space-related books rank?');
  scored.forEach(({ book, similarity }, idx) => {
    const isSpace = /space|galaxy|starship|astronaut|mars|planet|cosmos|interstellar/i.test(book.title + ' ' + (book.description || ''));
    if (isSpace) {
      console.log(`   Rank #${idx + 1} (sim=${similarity.toFixed(4)}) | "${book.title}"`);
    }
  });

  // 9. Sample a space book's buildBookText to check what was embedded
  const sampleSpace = spaceBooks.find(b => b.embedding?.length > 0);
  if (sampleSpace) {
    const fullBook = await Book.findById(sampleSpace._id).lean();
    const text = buildBookText(fullBook);
    console.log(`\n📝 Sample embedded text for "${sampleSpace.title}":`);
    console.log(`   "${text.slice(0, 500)}..."\n`);
  }

  await mongoose.disconnect();
  console.log('Done.');
}

diagnose().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
