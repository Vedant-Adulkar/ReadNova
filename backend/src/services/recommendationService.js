// backend/src/services/recommendationService.js
const Book = require("../models/Book");
const { getHybridRecommendations } = require("../recommendation/hybridEngine");
const gemini = require("../ai/geminiService");

/**
 * getRecommendations
 *
 * Orchestrates the full recommendation pipeline:
 *  1. (Optional) Parse a conversational query with Gemini to extract filters.
 *  2. Load all books from the database.
 *  3. Run the hybrid engine (content + collaborative or cold-start).
 *  4. Return top-N ranked results.
 *
 * @param {import('../models/User')} user    - Full user document
 * @param {object}  options
 * @param {string}  [options.query]          - Natural-language search string
 * @param {number}  [options.topN=10]        - Number of results to return
 * @returns {Promise<Array<{ book, finalScore, contentScore, collaborativeScore, explanation? }>>}
 */
const getRecommendations = async (user, { query = "", topN = 10 } = {}) => {
  // ── 1. Parse conversational query (with Gemini, fails gracefully) ──
  let filters = {};
  if (query && query.trim()) {
    filters = await gemini.parseConversationalQuery(query);
  }

  // ── 2. Load candidate books ────────────────────────────────────────
  // For efficiency, only fetch fields needed by the engine
  const allBooks = await Book.find({}).lean();

  if (allBooks.length === 0) {
    return [];
  }

  // ── 3. Run hybrid engine ───────────────────────────────────────────
  const rawResults = await getHybridRecommendations(user, allBooks, topN, filters);

  return rawResults;
};

/**
 * getExplanation
 * Generate a personalised "why this book" explanation via Gemini.
 * Falls back to a generic sentence if Gemini is unavailable.
 *
 * @param {import('../models/User')} user
 * @param {string} bookId
 * @returns {Promise<string>}
 */
const getExplanation = async (user, bookId) => {
  const book = await Book.findById(bookId).lean();
  if (!book) {
    const error = new Error("Book not found");
    error.statusCode = 404;
    throw error;
  }

  const userProfile = {
    personalityProfile: user.personalityProfile,
    completedGenres: (user.bookshelf?.completed || []).flatMap(() => []),
  };

  const explanation = await gemini.generateExplanation(userProfile, book);
  return { book, explanation };
};

module.exports = { getRecommendations, getExplanation };
