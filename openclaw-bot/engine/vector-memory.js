/**
 * CLAW-X Vector Memory Store
 *
 * Long-term memory layer using TF-IDF embeddings + cosine similarity.
 * Persists across sessions via JSON snapshots.
 *
 * Why not FAISS/Chroma in production?
 *   - Zero native dependencies (pure JS)
 *   - Works in browser + Node.js
 *   - For <10K entries, brute-force cosine is fast enough (~2ms)
 *   - Drop-in replacement: swap _cosineSimilarity for FAISS binding later
 *
 * Each entry stores:
 *   - embedding: Float64Array (TF-IDF vector)
 *   - payload: { plan, reflection, reward, trajectory, metaPrompt }
 *   - metadata: timestamps, access patterns, success tracking
 *
 * Integration with MCTS:
 *   - query() returns top-K similar entries → used as prior bias in MCTS nodes
 *   - reward feedback from MCTS updates entry success counts
 */

const fs = require('fs');
const path = require('path');

class VectorMemoryStore {
  constructor({ persistPath = null, maxEntries = 5000 } = {}) {
    this.entries = [];
    this.vocabulary = new Map(); // word → index
    this.idfCache = new Map();   // word → IDF value
    this.vocabSize = 0;
    this.maxEntries = maxEntries;
    this.persistPath = persistPath;
    this.dirty = false;

    if (persistPath) this._loadFromDisk();
  }

  /**
   * Store an observation with its context.
   *
   * @param {Object} opts
   * @param {string} opts.observation - the text to embed
   * @param {string} opts.summary - compressed version
   * @param {Object} opts.payload - { plan, reflection, reward, trajectory, metaPrompt }
   * @param {string[]} opts.tags
   * @returns {Object} the stored entry
   */
  store({ observation, summary = '', payload = {}, tags = [] }) {
    const text = `${observation} ${summary}`.trim();
    const embedding = this._embed(text);

    const entry = {
      id: crypto.randomUUID?.() ?? Math.random().toString(36).slice(2),
      observation: observation.slice(0, 500),
      summary: summary.slice(0, 200),
      embedding,
      payload,
      tags,
      createdAt: Date.now(),
      lastAccessed: Date.now(),
      accessCount: 0,
      successCount: 0,
      failureCount: 0
    };

    this.entries.push(entry);
    this._enforceCapacity();
    this._invalidateIDF();
    this.dirty = true;

    return entry;
  }

  /**
   * Query top-K most similar entries by cosine similarity.
   *
   * @param {string} query - text to search for
   * @param {number} topK - number of results (default 5)
   * @param {Object} opts - { minSimilarity, tags, boostRecent }
   * @returns {Array<{ entry, similarity }>}
   */
  query(query, topK = 5, { minSimilarity = 0.1, tags = null, boostRecent = true } = {}) {
    if (this.entries.length === 0) return [];

    const queryEmbedding = this._embed(query);
    const now = Date.now();

    const scored = this.entries
      .filter(e => !tags || tags.some(t => e.tags.includes(t)))
      .map(entry => {
        let similarity = this._cosineSimilarity(queryEmbedding, entry.embedding);

        // Boost recent entries slightly
        if (boostRecent) {
          const hoursSince = (now - entry.lastAccessed) / (1000 * 60 * 60);
          const recencyBoost = Math.max(0, 0.1 * (1 - hoursSince / 168));
          similarity += recencyBoost;
        }

        // Boost successful entries
        const total = entry.successCount + entry.failureCount;
        if (total > 0) {
          const successRate = entry.successCount / total;
          similarity += successRate * 0.05;
        }

        return { entry, similarity };
      })
      .filter(r => r.similarity >= minSimilarity);

    scored.sort((a, b) => b.similarity - a.similarity);
    const results = scored.slice(0, topK);

    // Touch accessed entries
    results.forEach(r => {
      r.entry.lastAccessed = now;
      r.entry.accessCount++;
    });

    this.dirty = true;
    return results;
  }

  /**
   * Compute prior for MCTS node based on similarity to long-term memory.
   * Returns 0..1 value used to bias tree search.
   */
  computePrior(candidateAction, context = {}) {
    const query = `${context.goal || ''} ${candidateAction}`.trim();
    const results = this.query(query, 3, { minSimilarity: 0.05 });
    if (results.length === 0) return 0.5; // neutral prior

    // Weighted average of similarities × success rates
    let totalWeight = 0;
    let weightedScore = 0;
    for (const { entry, similarity } of results) {
      const successRate = (entry.successCount + entry.failureCount) > 0
        ? entry.successCount / (entry.successCount + entry.failureCount)
        : 0.5;
      const weight = similarity;
      weightedScore += weight * successRate;
      totalWeight += weight;
    }

    return totalWeight > 0
      ? Math.min(1, Math.max(0, weightedScore / totalWeight))
      : 0.5;
  }

  /**
   * Record feedback from MCTS rollout results.
   */
  recordFeedback(entryId, success) {
    const entry = this.entries.find(e => e.id === entryId);
    if (!entry) return;
    if (success) entry.successCount++;
    else entry.failureCount++;
    this.dirty = true;
  }

  /**
   * Persist to disk (JSON).
   */
  save() {
    if (!this.persistPath || !this.dirty) return;
    const data = {
      entries: this.entries.map(e => ({
        ...e,
        embedding: Array.from(e.embedding) // Float64Array → JSON-safe
      })),
      vocabulary: Object.fromEntries(this.vocabulary),
      vocabSize: this.vocabSize
    };
    fs.mkdirSync(path.dirname(this.persistPath), { recursive: true });
    fs.writeFileSync(this.persistPath, JSON.stringify(data));
    this.dirty = false;
  }

  get stats() {
    return {
      entries: this.entries.length,
      vocabSize: this.vocabSize,
      avgSuccessRate: this._avgSuccessRate(),
      memoryBytes: this._estimateBytes()
    };
  }

  clear() {
    this.entries = [];
    this.vocabulary.clear();
    this.idfCache.clear();
    this.vocabSize = 0;
    this.dirty = true;
  }

  // --- TF-IDF Embedding ---

  _embed(text) {
    const tokens = this._tokenize(text);
    const tf = new Map();

    // Term frequency
    for (const token of tokens) {
      tf.set(token, (tf.get(token) || 0) + 1);
    }

    // Ensure all tokens are in vocabulary
    for (const token of tf.keys()) {
      if (!this.vocabulary.has(token)) {
        this.vocabulary.set(token, this.vocabSize++);
      }
    }

    // Build sparse TF-IDF vector
    const vector = new Float64Array(this.vocabSize);
    for (const [token, count] of tf) {
      const idx = this.vocabulary.get(token);
      const tfScore = count / tokens.length;
      const idf = this._idf(token);
      vector[idx] = tfScore * idf;
    }

    // L2 normalize
    let norm = 0;
    for (let i = 0; i < vector.length; i++) norm += vector[i] * vector[i];
    norm = Math.sqrt(norm);
    if (norm > 0) {
      for (let i = 0; i < vector.length; i++) vector[i] /= norm;
    }

    return vector;
  }

  _idf(token) {
    if (this.idfCache.has(token)) return this.idfCache.get(token);
    const docCount = this.entries.filter(e =>
      e.observation.toLowerCase().includes(token) ||
      e.summary.toLowerCase().includes(token)
    ).length;
    const idf = Math.log((this.entries.length + 1) / (docCount + 1)) + 1;
    this.idfCache.set(token, idf);
    return idf;
  }

  _invalidateIDF() {
    // IDF changes as corpus grows; invalidate periodically
    if (this.entries.length % 50 === 0) {
      this.idfCache.clear();
    }
  }

  _tokenize(text) {
    return text
      .toLowerCase()
      .replace(/[^\w\sа-яё]/gi, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2);
  }

  _cosineSimilarity(a, b) {
    const len = Math.min(a.length, b.length);
    let dot = 0;
    for (let i = 0; i < len; i++) dot += a[i] * b[i];
    // Vectors are already L2-normalized, so dot product = cosine similarity
    return dot;
  }

  // --- Housekeeping ---

  _enforceCapacity() {
    if (this.entries.length <= this.maxEntries) return;
    // Remove lowest-value entries: low access + low success + old
    this.entries.sort((a, b) => {
      const scoreA = a.accessCount * 0.3 + a.successCount * 0.4 + (a.lastAccessed / Date.now()) * 0.3;
      const scoreB = b.accessCount * 0.3 + b.successCount * 0.4 + (b.lastAccessed / Date.now()) * 0.3;
      return scoreB - scoreA;
    });
    this.entries = this.entries.slice(0, this.maxEntries);
  }

  _avgSuccessRate() {
    const withFeedback = this.entries.filter(e => e.successCount + e.failureCount > 0);
    if (withFeedback.length === 0) return 'N/A';
    const avg = withFeedback.reduce((sum, e) =>
      sum + e.successCount / (e.successCount + e.failureCount), 0
    ) / withFeedback.length;
    return avg.toFixed(2);
  }

  _estimateBytes() {
    // Rough estimate: each entry ~vocabSize*8 bytes for embedding + ~500 for metadata
    return this.entries.length * (this.vocabSize * 8 + 500);
  }

  _loadFromDisk() {
    try {
      if (!fs.existsSync(this.persistPath)) return;
      const raw = JSON.parse(fs.readFileSync(this.persistPath, 'utf-8'));
      this.vocabulary = new Map(Object.entries(raw.vocabulary || {}));
      this.vocabSize = raw.vocabSize || 0;
      this.entries = (raw.entries || []).map(e => ({
        ...e,
        embedding: new Float64Array(e.embedding || [])
      }));
    } catch {
      // Corrupted file, start fresh
      this.entries = [];
    }
  }
}

module.exports = { VectorMemoryStore };
