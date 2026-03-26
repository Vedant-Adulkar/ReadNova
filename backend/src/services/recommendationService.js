// backend/src/services/recommendationService.js
//
// Orchestrates the full recommendation pipeline:
//   1. Resolves input: mood || conversational query (never both)
//   2. Validates input with Joi
//   3. Builds genre/difficulty filters
//   4. Applies age-based content rating filter AT THE DB LEVEL
//   5. Runs the hybrid engine (content + collaborative or cold-start)
//   6. Returns top-N ranked results (cached for mood queries)

const Joi = require("joi");
const Book = require("../models/Book");
const { getHybridRecommendations } = require("../recommendation/hybridEngine");
const gemini = require("../ai/geminiService");
const { getCache, setCache } = require("../utils/cache");

// ── Mood → genre mapping (weighted structure, forward-compatible) ─────────────
// Each mood maps to a list of genres. Weights are stored for future use
// (e.g. re-ranking by weight), but current engine treats them as equal.
const MOOD_GENRE_MAP = {
  Happy:       [{ genre: "Humor", w: 0.7 },      { genre: "Romance", w: 0.3 }],
  Thoughtful:  [{ genre: "Philosophy", w: 0.6 }, { genre: "Literary Fiction", w: 0.4 }],
  Adventurous: [{ genre: "Adventure", w: 0.6 },  { genre: "Action", w: 0.4 }],
  Relaxing:    [{ genre: "Self-Help", w: 0.5 },  { genre: "Cozy Mystery", w: 0.5 }],
  Intense:     [{ genre: "Thriller", w: 0.6 },   { genre: "Horror", w: 0.4 }],
};

// ── Input validation schema ───────────────────────────────────────────────────
const inputSchema = Joi.object({
  mood: Joi.string().valid(...Object.keys(MOOD_GENRE_MAP)).optional(),
  query: Joi.string().min(2).max(500).trim().optional(),
  topN: Joi.number().integer().min(1).max(50).default(10),
}).or("mood", "query").optional();  // allow empty (cold-start with no filter)

// ── Allowed content ratings by age ───────────────────────────────────────────
const allowedRatingsForAge = (age) => {
  if (!age || age >= 18) return ["General", "Teen", "Mature"];
  if (age >= 13)         return ["General", "Teen"];
  return                         ["General"];
};

/**
 * getRecommendations
 *
 * @param {import('../models/User')} user
 * @param {{ mood?: string, query?: string, topN?: number }} options
 */
const getRecommendations = async (user, options = {}) => {
  // ── 1. Validate input ──────────────────────────────────────────────────────
  const { value: input, error } = inputSchema.validate(options, {
    allowUnknown: false,
    stripUnknown: true,
  });
  if (error) {
    const e = new Error(error.details[0].message);
    e.statusCode = 400;
    throw e;
  }

  const topN = input?.topN ?? 10;

  // ── 2. Mood path: check cache first ───────────────────────────────────────
  if (input?.mood) {
    const cacheKey = `mood:${input.mood}:user:${user._id}`;
    const cached = getCache(cacheKey);
    if (cached) {
      console.log(`📦 Cache hit: ${cacheKey}`);
      return cached;
    }
  }

  // ── 3. Build filters (mood takes priority over query) ─────────────────────
  let filters = {};

  if (input?.mood) {
    // Extract flat genre strings from weighted map (weights reserved for future use)
    const mapped = MOOD_GENRE_MAP[input.mood] || [];
    filters.genres = mapped.map((m) => m.genre);
    filters.mood = input.mood;
  } else if (input?.query?.trim()) {
    // Only call Gemini for conversational text queries
    filters = await gemini.parseConversationalQuery(input.query.trim());
  }

  // ── 4. Fetch books with age gate applied at DB level ──────────────────────
  const allowedRatings = allowedRatingsForAge(user.age);

  const dbQuery = { contentRating: { $in: allowedRatings } };

  // Optionally pre-filter by mapped genres in the DB for performance
  if (filters.genres && filters.genres.length > 0) {
    dbQuery.genres = { $in: filters.genres };
  }

  let allBooks = await Book.find(dbQuery).lean();

  // If the genre pre-filter returned nothing, fall back to all age-allowed books
  if (allBooks.length === 0 && filters.genres && filters.genres.length > 0) {
    console.log("ℹ️  Genre pre-filter returned empty set — relaxing to all age-allowed books.");
    allBooks = await Book.find({ contentRating: { $in: allowedRatings } }).lean();
  }

  if (allBooks.length === 0) return [];

  // ── 5. Run hybrid engine ──────────────────────────────────────────────────
  // Pass empty filters to engine since DB already pre-filtered by genre
  const engineFilters = { difficulty: filters.difficulty, keywords: filters.keywords };
  const rawResults = await getHybridRecommendations(user, allBooks, topN, engineFilters);

  // ── 6. Cache mood results (5 min TTL) ─────────────────────────────────────
  if (input?.mood) {
    const cacheKey = `mood:${input.mood}:user:${user._id}`;
    setCache(cacheKey, rawResults);
  }

  return rawResults;
};

/**
 * getExplanation
 * Generate a personalised "why this book" explanation via Gemini.
 *
 * @param {import('../models/User')} user
 * @param {string} bookId
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
