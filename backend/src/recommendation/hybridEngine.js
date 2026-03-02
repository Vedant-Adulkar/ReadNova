// backend/src/recommendation/hybridEngine.js
// Hybrid recommendation engine combining content-based and collaborative
// filtering with a weighted score:
//   finalScore = (0.6 × contentScore) + (0.4 × collaborativeScore)
//
// Cold-start handling: if the user has no embedding (new user), the engine
// uses genre/difficulty matching as a proxy content score and skips
// collaborative filtering entirely.

const { getContentBasedScores } = require("./contentBased");
const { getCollaborativeScores } = require("./collaborative");

/**
 * coldStartScores
 * For new users with no embedding, score books by how many of the user's
 * preferred genres the book contains, normalised to [0, 1].
 *
 * @param {string[]} preferredGenres   - From quiz / profile
 * @param {string}   preferredDifficulty - 'Beginner' | 'Intermediate' | 'Advanced'
 * @param {object[]} books
 * @returns {Array<{ book: object, score: number }>}
 */
const coldStartScores = (preferredGenres, preferredDifficulty, books) => {
  const genreSet = new Set((preferredGenres || []).map((g) => g.toLowerCase()));

  return books.map((book) => {
    const bookGenres = (book.genres || []).map((g) => g.toLowerCase());
    const overlap = bookGenres.filter((g) => genreSet.has(g)).length;

    // Genre overlap score (0 – 1)
    const genreScore =
      genreSet.size > 0 ? overlap / Math.max(genreSet.size, bookGenres.length) : 0;

    // Small difficulty bonus
    const difficultyBonus =
      preferredDifficulty && book.difficultyLevel === preferredDifficulty ? 0.1 : 0;

    return { book, score: Math.min(genreScore + difficultyBonus, 1) };
  });
};

/**
 * normaliseScores
 * Min-max normalise an array of { book, score } so all scores are in [0, 1].
 * Falls back to original scores if min === max.
 *
 * @param {Array<{ book: object, score: number }>} scored
 * @returns {Map<string, number>}  bookId → normalised score
 */
const normaliseToMap = (scored) => {
  const scores = scored.map((s) => s.score);
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const range = max - min;

  return new Map(
    scored.map(({ book, score }) => [
      book._id.toString(),
      range === 0 ? score : (score - min) / range,
    ])
  );
};

/**
 * getHybridRecommendations
 *
 * @param {import('../models/User')} user        - Full user document
 * @param {object[]}                 allBooks    - All Book documents
 * @param {number}                   [topN=10]   - How many books to return
 * @param {object}                   [filters]   - Optional pre-filter from Gemini query parsing
 * @param {string[]}  [filters.genres]
 * @param {string}    [filters.difficulty]
 * @param {string[]}  [filters.keywords]
 * @returns {Promise<Array<{ book: object, finalScore: number, contentScore: number, collaborativeScore: number }>>}
 */
const getHybridRecommendations = async (user, allBooks, topN = 10, filters = {}) => {
  // ── 1. Optional pre-filter from conversational query ──────────────
  let candidateBooks = [...allBooks];

  if (filters.genres && filters.genres.length > 0) {
    const genreSet = new Set(filters.genres.map((g) => g.toLowerCase()));
    const filtered = candidateBooks.filter((b) =>
      (b.genres || []).some((g) => genreSet.has(g.toLowerCase()))
    );
    // Only apply genre filter if we still have candidates
    if (filtered.length > 0) candidateBooks = filtered;
  }

  if (filters.difficulty) {
    const filtered = candidateBooks.filter(
      (b) => b.difficultyLevel === filters.difficulty
    );
    if (filtered.length > 0) candidateBooks = filtered;
  }

  // ── 2. Detect cold-start ──────────────────────────────────────────
  const isColdStart =
    !user.preferenceEmbedding || user.preferenceEmbedding.length === 0;

  // ── 3. Content scores ─────────────────────────────────────────────
  let contentScored;
  if (isColdStart) {
    console.log(`ℹ️  Cold-start for user ${user._id}: using genre/difficulty matching.`);
    contentScored = coldStartScores(
      filters.genres || [],
      filters.difficulty || null,
      candidateBooks
    );
  } else {
    contentScored = getContentBasedScores(user.preferenceEmbedding, candidateBooks);
  }

  const contentMap = normaliseToMap(contentScored);

  // ── 4. Collaborative scores (skip for cold-start) ─────────────────
  let collabMap = new Map();
  if (!isColdStart) {
    const collabScored = await getCollaborativeScores(user, candidateBooks);
    collabMap = normaliseToMap(collabScored);
  }

  // ── 5. Hybrid scoring ─────────────────────────────────────────────
  const CONTENT_WEIGHT = isColdStart ? 1.0 : 0.6;
  const COLLAB_WEIGHT = isColdStart ? 0.0 : 0.4;

  const results = candidateBooks.map((book) => {
    const id = book._id.toString();
    const contentScore = contentMap.get(id) ?? 0;
    const collaborativeScore = collabMap.get(id) ?? 0;
    const finalScore =
      CONTENT_WEIGHT * contentScore + COLLAB_WEIGHT * collaborativeScore;

    return { book, finalScore, contentScore, collaborativeScore };
  });

  // ── 6. Sort and return top N ──────────────────────────────────────
  return results
    .sort((a, b) => b.finalScore - a.finalScore)
    .slice(0, topN);
};

module.exports = { getHybridRecommendations };
