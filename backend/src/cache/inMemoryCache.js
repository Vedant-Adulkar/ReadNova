// backend/src/cache/inMemoryCache.js
// Simple in‑memory cache with optional TTL (seconds).
// Uses a Map to store values and a cleanup timer for expirations.

class InMemoryCache {
  constructor() {
    this.store = new Map();
  }

  _now() {
    return Date.now();
  }

  set(key, value, ttlSeconds = null) {
    const expires = ttlSeconds ? this._now() + ttlSeconds * 1000 : null;
    this.store.set(key, { value, expires });
    if (expires) {
      // Schedule cleanup
      setTimeout(() => this._cleanupKey(key), ttlSeconds * 1000);
    }
  }

  get(key) {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (entry.expires && entry.expires < this._now()) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  _cleanupKey(key) {
    const entry = this.store.get(key);
    if (entry && entry.expires && entry.expires < this._now()) {
      this.store.delete(key);
    }
  }
}

module.exports = new InMemoryCache();
