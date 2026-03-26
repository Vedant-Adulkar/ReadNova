// backend/src/utils/cache.js
// Simple in-memory TTL cache for recommendation results.
// Avoids redundant DB + Gemini calls for identical mood/user combos.

const store = new Map();
const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Get a cached value by key.
 * Returns undefined if the key doesn't exist or has expired.
 *
 * @param {string} key
 * @returns {any|undefined}
 */
const getCache = (key) => {
  const entry = store.get(key);
  if (!entry) return undefined;

  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return undefined;
  }

  return entry.value;
};

/**
 * Store a value, optionally with a custom TTL.
 *
 * @param {string} key
 * @param {any}    value
 * @param {number} [ttlMs]  - milliseconds until expiry (default: 5 min)
 */
const setCache = (key, value, ttlMs = DEFAULT_TTL_MS) => {
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
};

/** Delete a specific cache entry. */
const deleteCache = (key) => store.delete(key);

/** Clear everything (useful for testing). */
const clearCache = () => store.clear();

module.exports = { getCache, setCache, deleteCache, clearCache };
