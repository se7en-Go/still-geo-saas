class SimpleCache {
  constructor({ ttlMs = 60000, maxEntries = 200 } = {}) {
    this.ttlMs = typeof ttlMs === 'number' && ttlMs > 0 ? ttlMs : 60000;
    this.maxEntries = typeof maxEntries === 'number' && maxEntries > 0 ? maxEntries : 200;
    this.store = new Map();
    this.stats = { hits: 0, misses: 0 };
  }

  get(key) {
    const entry = this.store.get(key);
    const now = Date.now();
    if (!entry) {
      this.stats.misses += 1;
      return null;
    }
    if (entry.expiresAt <= now) {
      this.store.delete(key);
      this.stats.misses += 1;
      return null;
    }
    this.stats.hits += 1;
    return entry.value;
  }

  set(key, value) {
    const now = Date.now();
    this.store.set(key, {
      value,
      expiresAt: now + this.ttlMs,
      insertedAt: now,
    });
    this._trim();
  }

  delete(key) {
    this.store.delete(key);
  }

  deleteByPrefix(prefix) {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) {
        this.store.delete(key);
      }
    }
  }

  clear() {
    this.store.clear();
    this.stats = { hits: 0, misses: 0 };
  }

  getStats() {
    return {
      size: this.store.size,
      hits: this.stats.hits,
      misses: this.stats.misses,
      ttlMs: this.ttlMs,
      maxEntries: this.maxEntries,
    };
  }

  _trim() {
    if (this.store.size <= this.maxEntries) {
      return;
    }

    const entries = Array.from(this.store.entries()).sort(
      (a, b) => a[1].insertedAt - b[1].insertedAt
    );

    while (entries.length && this.store.size > this.maxEntries) {
      const [oldestKey] = entries.shift();
      this.store.delete(oldestKey);
    }
  }
}

module.exports = SimpleCache;
