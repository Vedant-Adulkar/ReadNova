// backend/src/recommendation/semanticSearch.js
// Pure semantic search using cosine similarity between a query embedding
// and each book's pre-computed embedding vector.
//
// Assumes book.embedding fields have already been populated by
// embeddingService.embedBooksInBatches().

const cosineSimilarity = require("../utils/cosineSimilarity");

/**
 * semanticSearch
 *
 * Ranks all candidate books by cosine similarity to a query embedding.
 * Books with empty embeddings are assigned a score of 0 and fall to the bottom.
 *
 * @param {number[]} queryEmbedding   - Dense vector from embedText(query)
 * @param {object[]} books            - Array of Book documents (must have .embedding)
 * @param {number}   [topN=10]        - Maximum number of results to return
 * @returns {Array<{ book: object, score: number }>}  Sorted descending by score
 */
const semanticSearch = (queryEmbedding, books, topN = 10) => {
  if (!queryEmbedding || queryEmbedding.length === 0) {
    // No embedding available — return books with zero scores (caller should fallback)
    return books.slice(0, topN).map((book) => ({ book, score: 0 }));
  }

  const scored = books.map((book) => {
    const bookEmbedding = book.embedding || [];
    // Skip cosine calculation for books without embeddings
    const score =
      bookEmbedding.length > 0
        ? cosineSimilarity(queryEmbedding, bookEmbedding)
        : 0;

    return { book, score };
  });

  // Sort descending by similarity score, then slice to topN
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);
};

/**
 * hasEmbeddings — quick check: do any books in the collection have embeddings?
 * Used by the search controller to decide whether to try semantic search.
 *
 * @param {object[]} books
 * @returns {boolean}
 */
const hasEmbeddings = (books) =>
  books.some((b) => Array.isArray(b.embedding) && b.embedding.length > 0);

module.exports = { semanticSearch, hasEmbeddings };
