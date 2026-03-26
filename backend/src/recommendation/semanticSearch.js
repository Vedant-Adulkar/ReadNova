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
 * Ranks candidate books by cosine similarity to a query embedding and
 * returns only those that clear a minimum relevance threshold.
 * Books with empty embeddings are assigned a score of 0.
 *
 * With Google Gemini embeddings (gemini-embedding-001, 768-dim) cosine
 * similarity is typically 0.3–0.6 even between unrelated texts, so a
 * default threshold of 0.50 is used to suppress noise results.
 *
 * @param {number[]} queryEmbedding        - Dense vector from embedText(query)
 * @param {object[]} books                 - Array of Book documents (must have .embedding)
 * @param {number}   [topN=10]             - Maximum number of results to return
 * @param {number}   [threshold=0.50]      - Minimum cosine similarity score to include
 * @returns {Array<{ book: object, score: number }>}  Sorted descending; empty if nothing clears threshold
 */
const semanticSearch = (queryEmbedding, books, topN = 10, threshold = 0.50) => {
  if (!queryEmbedding || queryEmbedding.length === 0) {
    // No embedding available — return empty so caller falls back
    return [];
  }

  const scored = books.map((book) => {
    const bookEmbedding = book.embedding || [];
    const score =
      bookEmbedding.length > 0
        ? cosineSimilarity(queryEmbedding, bookEmbedding)
        : 0;
    return { book, score };
  });

  // Filter by threshold FIRST, then sort and slice
  return scored
    .filter((r) => r.score >= threshold)
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
