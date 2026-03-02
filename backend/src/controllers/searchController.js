// backend/src/controllers/searchController.js
// Semantic search controller:
//  1. Embeds the user's query using Gemini text-embedding-004
//  2. Ranks all embedded books by cosine similarity
//  3. Falls back to MongoDB $text search if Gemini is unavailable
//     or no books have embeddings yet
//
// Route:  GET /api/books/semantic-search?q=...&topN=10&genre=...&difficulty=...

const asyncHandler = require("../utils/asyncHandler");
const Book = require("../models/Book");
const { embedText } = require("../services/embeddingService");
const { semanticSearch, hasEmbeddings } = require("../recommendation/semanticSearch");

/**
 * semanticSearchBooks
 *
 * @route  GET /api/books/semantic-search
 * @access Protected
 * @query  q          {string}  Natural-language query (required)
 * @query  topN       {number}  Max results (default 10, max 50)
 * @query  genre      {string}  Optional genre pre-filter
 * @query  difficulty {string}  Optional difficulty pre-filter
 */
exports.semanticSearchBooks = asyncHandler(async (req, res) => {
  const { q = "", topN = 10, genre, difficulty } = req.query;
  const limit = Math.min(parseInt(topN, 10) || 10, 50);

  if (!q.trim()) {
    return res.status(400).json({
      success: false,
      message: "Query parameter 'q' is required for semantic search.",
    });
  }

  // ── 1. Build DB filter (optional pre-filters) ─────────────────────────────
  const dbFilter = {};
  if (genre) {
    dbFilter.genres = { $in: [genre] };
  }
  if (difficulty) {
    dbFilter.difficultyLevel = difficulty;
  }

  // Fetch all candidate books (lean for performance)
  const allBooks = await Book.find(dbFilter)
    .select("title author genres description difficultyLevel embedding averageRating coverImage ratingsCount")
    .lean();

  if (allBooks.length === 0) {
    return res.json({
      success: true,
      count: 0,
      results: [],
      searchType: "none",
      message: "No books found matching your filters.",
    });
  }

  // ── 2. Try semantic search ─────────────────────────────────────────────────
  const booksHaveEmbeddings = hasEmbeddings(allBooks);

  if (booksHaveEmbeddings) {
    // Attempt to embed the query
    const queryEmbedding = await embedText(q.trim());

    if (queryEmbedding.length > 0) {
      const results = semanticSearch(queryEmbedding, allBooks, limit);

      // Filter out zero-score books (unembedded) from results
      const meaningful = results.filter((r) => r.score > 0);

      if (meaningful.length > 0) {
        return res.json({
          success: true,
          count: meaningful.length,
          query: q.trim(),
          searchType: "semantic",
          results: meaningful.map(({ book, score }) => ({
            book: sanitizeBook(book),
            similarityScore: parseFloat(score.toFixed(4)),
            similarityPercent: Math.round(score * 100),
          })),
        });
      }
    }
  }

  // ── 3. Fallback: MongoDB text search ─────────────────────────────────────
  console.log(`ℹ️  Semantic search unavailable — falling back to text search for: "${q}"`);

  const textFilter = { ...dbFilter, $text: { $search: q.trim() } };
  const textBooks = await Book.find(textFilter)
    .select("title author genres description difficultyLevel averageRating coverImage ratingsCount")
    .sort({ score: { $meta: "textScore" } })
    .limit(limit)
    .lean();

  return res.json({
    success: true,
    count: textBooks.length,
    query: q.trim(),
    searchType: "text",
    message: "Semantic search unavailable — showing text search results.",
    results: textBooks.map((book) => ({
      book: sanitizeBook(book),
      similarityScore: null,
      similarityPercent: null,
    })),
  });
});

// ─── Helper: strip the raw embedding vector from the response ─────────────────
const sanitizeBook = (book) => {
  const { embedding, ...rest } = book;  // eslint-disable-line no-unused-vars
  return rest;
};
