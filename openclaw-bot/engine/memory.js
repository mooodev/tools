/**
 * CLAW-X Layered Memory System
 *
 * Three memory layers:
 *   (A) Semantic  - facts, rules (stable knowledge)
 *   (B) Episodic  - experiences, action results
 *   (C) Procedural - strategies, "how to solve" patterns
 *
 * Each entry carries: content, confidence, source, timestamp, successCount
 * Memory decays over time. Contradictions are flagged, not overwritten.
 */

class MemoryEntry {
  constructor({ content, type, confidence = 0.7, source = 'observation', tags = [] }) {
    this.id = crypto.randomUUID?.() ?? Math.random().toString(36).slice(2);
    this.content = content;
    this.type = type; // 'semantic' | 'episodic' | 'procedural'
    this.confidence = confidence;
    this.source = source;
    this.tags = tags;
    this.createdAt = Date.now();
    this.lastAccessed = Date.now();
    this.accessCount = 0;
    this.successCount = 0;
    this.failureCount = 0;
    this.contradictions = [];
  }

  touch() {
    this.lastAccessed = Date.now();
    this.accessCount++;
  }

  recordSuccess() { this.successCount++; }
  recordFailure() { this.failureCount++; }

  get successRate() {
    const total = this.successCount + this.failureCount;
    return total === 0 ? 0.5 : this.successCount / total;
  }

  get age() {
    return (Date.now() - this.createdAt) / (1000 * 60 * 60); // hours
  }

  get recency() {
    const hoursSinceAccess = (Date.now() - this.lastAccessed) / (1000 * 60 * 60);
    return Math.max(0, 1 - hoursSinceAccess / 168); // decays over 1 week
  }
}

class MemorySystem {
  constructor() {
    this.semantic = [];   // facts, rules
    this.episodic = [];   // experiences
    this.procedural = []; // strategies
  }

  store(entry) {
    const mem = entry instanceof MemoryEntry ? entry : new MemoryEntry(entry);
    const layer = this[mem.type];
    if (!layer) throw new Error(`Unknown memory type: ${mem.type}`);

    // Contradiction detection: check if new entry conflicts with existing
    const contradicting = layer.filter(
      existing => this._contradicts(existing, mem)
    );
    if (contradicting.length > 0) {
      mem.contradictions = contradicting.map(c => c.id);
      contradicting.forEach(c => c.contradictions.push(mem.id));
    }

    layer.push(mem);
    this._enforceCapacity(mem.type);
    return mem;
  }

  /**
   * Core retrieval with scoring: the "strong agent" picks memory, not reads all.
   *
   * score = relevance_to_goal × 0.4
   *       + recency × 0.2
   *       + success_history × 0.3
   *       - noise_penalty × 0.3
   */
  retrieve({ goal, query, topK = 5, types = ['semantic', 'episodic', 'procedural'] }) {
    const allMemories = types.flatMap(t => this[t] || []);

    const scored = allMemories.map(mem => {
      const relevance = this._relevanceScore(mem, goal, query);
      const recency = mem.recency;
      const successHistory = mem.successRate;
      const noisePenalty = mem.contradictions.length > 0 ? 0.2 : 0;

      const score =
        relevance * 0.4 +
        recency * 0.2 +
        successHistory * 0.3 -
        noisePenalty * 0.3;

      return { memory: mem, score };
    });

    scored.sort((a, b) => b.score - a.score);
    const results = scored.slice(0, topK);

    // Touch accessed memories
    results.forEach(r => r.memory.touch());

    return results;
  }

  getAllFormatted(types = ['semantic', 'episodic', 'procedural']) {
    return types.flatMap(t => (this[t] || []).map(m => ({
      type: m.type,
      content: m.content,
      confidence: m.confidence,
      successRate: m.successRate,
      hasContradictions: m.contradictions.length > 0
    })));
  }

  clear() {
    this.semantic = [];
    this.episodic = [];
    this.procedural = [];
  }

  get stats() {
    return {
      semantic: this.semantic.length,
      episodic: this.episodic.length,
      procedural: this.procedural.length,
      total: this.semantic.length + this.episodic.length + this.procedural.length
    };
  }

  // --- Private helpers ---

  _relevanceScore(mem, goal, query) {
    if (!goal && !query) return 0.5;
    const text = (goal + ' ' + (query || '')).toLowerCase();
    const content = mem.content.toLowerCase();
    const words = text.split(/\s+/).filter(w => w.length > 3);
    if (words.length === 0) return 0.3;
    const matches = words.filter(w => content.includes(w)).length;
    return Math.min(1, matches / words.length + 0.1);
  }

  _contradicts(a, b) {
    if (a.type !== b.type) return false;
    // Simple heuristic: same tags but different content
    const sharedTags = a.tags.filter(t => b.tags.includes(t));
    if (sharedTags.length === 0) return false;
    return a.content !== b.content && sharedTags.length >= Math.min(a.tags.length, b.tags.length) * 0.5;
  }

  _enforceCapacity(type) {
    const limits = { semantic: 100, episodic: 200, procedural: 50 };
    const layer = this[type];
    const limit = limits[type] || 100;
    if (layer.length > limit) {
      // Remove lowest confidence + oldest
      layer.sort((a, b) => (b.confidence + b.recency) - (a.confidence + a.recency));
      this[type] = layer.slice(0, limit);
    }
  }
}

module.exports = { MemorySystem, MemoryEntry };
