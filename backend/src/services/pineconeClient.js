// backend/src/services/pineconeClient.js
// Singleton Pinecone client + index reference.
// Both embeddingService and searchController import from here.
//
// Requires environment variables:
//   PINECONE_API_KEY       — from Pinecone dashboard
//   PINECONE_INDEX_NAME    — e.g. "books-index" (dimension: 768, metric: cosine)

const { Pinecone } = require("@pinecone-database/pinecone");

let _index = null;

/**
 * getIndex — lazily initialises the Pinecone client and returns the index.
 * Lazy so the server can start without Pinecone keys (falls back gracefully
 * when keys are absent).
 */
const getIndex = () => {
  if (_index) return _index;

  if (!process.env.PINECONE_API_KEY) {
    throw new Error("PINECONE_API_KEY is not set in environment variables.");
  }
  if (!process.env.PINECONE_INDEX_NAME) {
    throw new Error("PINECONE_INDEX_NAME is not set in environment variables.");
  }

  const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
  _index = pc.index(process.env.PINECONE_INDEX_NAME);
  return _index;
};

/**
 * isPineconeConfigured — cheap check used by code paths that want to
 * gracefully degrade when Pinecone keys are absent.
 */
const isPineconeConfigured = () =>
  Boolean(process.env.PINECONE_API_KEY && process.env.PINECONE_INDEX_NAME);

module.exports = { getIndex, isPineconeConfigured };
