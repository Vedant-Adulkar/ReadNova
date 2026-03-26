// backend/src/controllers/searchController.js
// Semantic search controller.
//
// Strategy (priority order):
//   1. Pinecone (vector DB) — used when PINECONE_API_KEY is configured
//   2. In-memory cosine similarity on MongoDB embeddings — fallback
//   3. Google Books API — final fallback when no embeddings exist at all
//
// Route:  GET /api/books/semantic-search?q=...&topN=10&genre=...&difficulty=...

const asyncHandler = require("../utils/asyncHandler");
const Book = require("../models/Book");
const { embedText } = require("../services/embeddingService");
const { semanticSearch, hasEmbeddings } = require("../recommendation/semanticSearch");
const { searchGoogleBooks } = require("../services/googleBooksService");
const { getIndex, isPineconeConfigured } = require("../services/pineconeClient");
const { persistAndEmbedGoogleBooks } = require("../services/embeddingService");

/**
 * semanticSearchBooks
 *
 * @route  GET /api/books/semantic-search
 * @access Protected
 * @query  q          {string}  Natural-language query (required, min 2 chars)
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

  // ── 1. Embed the query ────────────────────────────────────────────────────
  const queryVector = await embedText(q.trim());
  const hasQueryVector = queryVector.length > 0;

  // ── 2. Pinecone path ──────────────────────────────────────────────────────
  if (hasQueryVector && isPineconeConfigured()) {
    try {
      const index = getIndex();

      // Build optional Pinecone metadata filter
      const filter = {};
      if (genre) filter.genres = { $in: [genre] };
      if (difficulty) filter.difficultyLevel = { $eq: difficulty };

      const queryOptions = {
        vector: queryVector,
        topK: limit,
        includeMetadata: false,
        ...(Object.keys(filter).length > 0 && { filter }),
      };

      const pineconeRes = await index.query(queryOptions);
      const matches = pineconeRes.matches || [];

      if (matches.length > 0) {
        // Fetch full book documents from MongoDB by the IDs Pinecone returned
        const ids = matches.map((m) => m.id);
        const books = await Book.find({ _id: { $in: ids } }).lean();

        // Attach Pinecone similarity scores and preserve Pinecone's ranking order
        const bookMap = new Map(books.map((b) => [b._id.toString(), b]));
        const results = matches
          .map((m) => {
            const book = bookMap.get(m.id);
            if (!book) return null;
            const { embedding, ...bookData } = book; // strip embedding from response
            return {
              book: bookData,
              similarityScore: parseFloat(m.score.toFixed(4)),
              similarityPercent: Math.round(m.score * 100),
            };
          })
          .filter(Boolean);

        return res.json({
          success: true,
          count: results.length,
          query: q.trim(),
          searchType: "semantic_pinecone",
          results,
        });
      }
    } catch (err) {
      console.error("⚠️  Pinecone query failed, falling back:", err.message);
      // Fall through to in-memory path
    }
  }

  // ── 3. In-memory cosine similarity (Pinecone unavailable or unconfigured) ─
  if (hasQueryVector) {
    const dbFilter = {};
    if (genre) dbFilter.genres = { $in: [genre] };
    if (difficulty) dbFilter.difficultyLevel = difficulty;

    const allBooks = await Book.find(dbFilter)
      .select("title author genres description difficultyLevel contentRating embedding averageRating coverImage ratingsCount")
      .lean();

    if (allBooks.length > 0 && hasEmbeddings(allBooks)) {
      // semanticSearch filters internally at its default threshold (0.50).
      // If nothing clears the threshold it returns [], falling through to Google Books.
      const ranked = semanticSearch(queryVector, allBooks, limit);

      if (ranked.length > 0) {
        return res.json({
          success: true,
          count: ranked.length,
          query: q.trim(),
          searchType: "semantic",
          results: ranked.map(({ book, score }) => {
            const { embedding, ...bookData } = book;
            return {
              book: bookData,
              similarityScore: parseFloat(score.toFixed(4)),
              similarityPercent: Math.round(score * 100),
            };
          }),
        });
      }

      // Nothing cleared the 0.50 threshold — fall through to Google Books
      console.log(`ℹ️  No books above similarity threshold for: "${q}" — falling back to Google Books.`);
    }
  }

  // ── 4. Google Books API final fallback ────────────────────────────────────
  console.log(`ℹ️  Semantic search → Google Books fallback for: "${q}"`);

  try {
    let googleQuery = q.trim();
    if (genre) googleQuery += ` subject:${genre}`;
    if (difficulty === "Beginner") googleQuery += " introductory easy";
    else if (difficulty === "Advanced") googleQuery += " advanced comprehensive";

    const { books: googleBooks } = await searchGoogleBooks(googleQuery, { limit });

    // ── Background: persist + embed Google Books results so future searches
    // hit Tier 2 (cosine similarity) instead of falling back here again.
    if (googleBooks.length > 0) {
      persistAndEmbedGoogleBooks(googleBooks).catch((err) =>
        console.error("⚠️  Background persistAndEmbedGoogleBooks error:", err.message)
      );
    }

    return res.json({
      success: true,
      count: googleBooks.length,
      query: q.trim(),
      searchType: "google_books",
      message: "Results powered by Google Books.",
      results: googleBooks.map((book) => ({
        book: {
          _id: book._id,
          title: book.title,
          author: book.author,
          genres: book.genres,
          description: book.description,
          difficultyLevel: book.difficultyLevel,
          averageRating: book.averageRating,
          ratingsCount: book.ratingsCount,
          coverImage: book.coverImage,
          previewLink: book.previewLink,
          source: "google_books",
        },
        similarityScore: null,
        similarityPercent: null,
      })),
    });
  } catch (err) {
    console.error("Google Books fallback failed:", err.message);
    return res.json({ success: true, count: 0, query: q.trim(), searchType: "none", results: [] });
  }
});
