// backend/src/recommendation/collaborative.js
// Collaborative filtering using bookshelf overlap (Jaccard similarity).
// Finds users with similar reading histories and recommends books
// those users completed that the current user has not read yet.

const User = require("../models/User");

/**
 * jaccardSimilarity — compute Jaccard coefficient between two Sets.
 * |A ∩ B| / |A ∪ B|
 *
 * @param {Set} setA
 * @param {Set} setB
 * @returns {number}  0 → 1
 */
const jaccardSimilarity = (setA, setB) => {
  if (setA.size === 0 && setB.size === 0) return 0;
  const intersection = new Set([...setA].filter((x) => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return intersection.size / union.size;
};

/**
 * getCollaborativeScores
 *
 * Algorithm:
 *  1. Load all other users' completed bookshelves from DB.
 *  2. Compute Jaccard similarity between target user's and each other user's
 *     completed set (using book IDs as elements).
 *  3. Gather books completed by similar users (similarity > threshold).
 *  4. For each candidate book, accumulate a weighted score proportional
 *     to the similarity of the user who completed it.
 *  5. Exclude books already on any of the target user's shelves.
 *
 * @param {import('../models/User')} targetUser   - Full user document
 * @param {Array<import('../models/Book')>} books - All books (used for ID reference)
 * @returns {Promise<Array<{ book: object, score: number }>>}  Sorted descending
 */
const getCollaborativeScores = async (targetUser, books) => {
  try {
    const targetCompleted = new Set(
      (targetUser.bookshelf?.completed || []).map((entry) =>
        entry.book.toString()
      )
    );

    // All books on ANY shelf of the target user (books to exclude)
    const targetAllShelves = new Set([
      ...(targetUser.bookshelf?.wantToRead || []).map((e) => e.book.toString()),
      ...(targetUser.bookshelf?.reading || []).map((e) => e.book.toString()),
      ...targetCompleted,
    ]);

    // ── Load other users (only completed shelf, lean for performance) ──
    const otherUsers = await User.find({ _id: { $ne: targetUser._id } })
      .select("bookshelf.completed")
      .lean();

    // Build a map from bookId → accumulated collaborative score
    const scoreMap = {};

    for (const other of otherUsers) {
      const otherCompleted = new Set(
        (other.bookshelf?.completed || []).map((e) => e.book.toString())
      );

      const similarity = jaccardSimilarity(targetCompleted, otherCompleted);
      if (similarity === 0) continue; // No overlap — skip

      // Books this similar user completed that the target hasn't read
      for (const bookId of otherCompleted) {
        if (targetAllShelves.has(bookId)) continue; // User already knows this book

        scoreMap[bookId] = (scoreMap[bookId] || 0) + similarity;
      }
    }

    // ── Map accumulated scores back to Book documents ─────────────────
    const bookMap = new Map(books.map((b) => [b._id.toString(), b]));

    const result = Object.entries(scoreMap)
      .filter(([bookId]) => bookMap.has(bookId))
      .map(([bookId, score]) => ({ book: bookMap.get(bookId), score }))
      .sort((a, b) => b.score - a.score);

    return result;
  } catch (error) {
    console.error("Collaborative filtering error:", error.message);
    return []; // Degrade gracefully — hybrid engine will use content scores only
  }
};

module.exports = { getCollaborativeScores };
