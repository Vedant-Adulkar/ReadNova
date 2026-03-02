// backend/src/recommendation/contentBased.js
// Content-based filtering using cosine similarity between
// a user's preference embedding and each book's embedding vector.

const cosineSimilarity = require("../utils/cosineSimilarity");

/**
 * getContentBasedScores
 *
 * For each book, compute the cosine similarity between the user's
 * preferenceEmbedding and the book's embedding vector.
 *
 * @param {number[]} userEmbedding   - Dense preference vector from user profile
 * @param {Array<import('../models/Book')>} books  - Array of Book documents
 * @returns {Array<{ book: object, score: number }>}  Sorted descending by score
 */
const getContentBasedScores = (userEmbedding, books) => {
  // If the user has no embedding yet, return zero scores for all
  if (!userEmbedding || userEmbedding.length === 0) {
    return books.map((book) => ({ book, score: 0 }));
  }

  const scored = books.map((book) => {
    const score = cosineSimilarity(userEmbedding, book.embedding || []);
    return { book, score };
  });

  // Sort highest similarity first
  return scored.sort((a, b) => b.score - a.score);
};

module.exports = { getContentBasedScores };
