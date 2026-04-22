// backend/src/recommendation/hybridSearch.js
// Hybrid search that merges results from multiple query embeddings and applies keyword boost.

const { semanticSearch, applyHybridKeywordBoost } = require('./semanticSearch');
const { mergeResults } = require('./utils');
const { logger } = require('../utils/logger');

/**
 * hybridSearch
 *   - embeddings: array of query embedding vectors (each a number[])
 *   - books: candidate Book documents (must contain .embedding field)
 *   - rawQuery: original user query string (used for keyword boost)
 *   - topN: number of final results to return
 * Returns an array of { book, score } sorted descending.
 */
function hybridSearch(embeddings, books, rawQuery, topN = 10) {
  if (!Array.isArray(embeddings) || embeddings.length === 0) {
    logger.warn({ message: 'hybridSearch called with no embeddings', rawQuery });
    return [];
  }

  // Map of bookId -> { book, score }
  const resultMap = new Map();

  // For each embedding, run semanticSearch and merge highest scores.
  embeddings.forEach((emb) => {
    const semanticResults = semanticSearch(emb, books, topN * 3); // over‑fetch for merging
    semanticResults.forEach(({ book, score }) => {
      const id = book._id.toString();
      const existing = resultMap.get(id);
      if (!existing || score > existing.score) {
        resultMap.set(id, { book, score });
      }
    });
  });

  // Convert map to array for keyword boost.
  const mergedArray = Array.from(resultMap.values()).map(({ book, score }) => ({ book, baseScore: score }));

  // Apply keyword boost using the existing helper.
  const boosted = applyHybridKeywordBoost(rawQuery, mergedArray, topN);
  return boosted;
}

module.exports = { hybridSearch };
