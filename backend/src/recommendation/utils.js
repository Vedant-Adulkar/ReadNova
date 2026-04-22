// backend/src/recommendation/utils.js
// Utility helpers for recommendation pipeline.

const cache = require('../cache/inMemoryCache');

/**
 * mergeResults – keep the highest score per book.
 * @param {Map<string, object>} existingMap - map of bookId -> { book, score }
 * @param {{ book: object, score: number }} newItem
 */
function mergeResults(existingMap, newItem) {
  const id = newItem.book._id.toString();
  const prev = existingMap.get(id);
  if (!prev || newItem.score > prev.score) {
    existingMap.set(id, newItem);
  }
}

/**
 * getEmbeddingCache – retrieve cached embedding for a variant.
 * @param {string} key
 * @returns {any}
 */
function getEmbeddingCache(key) {
  return cache.get(key);
}

/**
 * setEmbeddingCache – store embedding in cache with optional TTL.
 * @param {string} key
 * @param {any} value
 * @param {number} [ttl] - seconds
 */
function setEmbeddingCache(key, value, ttl) {
  cache.set(key, value, ttl);
}

module.exports = { mergeResults, getEmbeddingCache, setEmbeddingCache };
