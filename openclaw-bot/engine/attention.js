/**
 * CLAW-X Attention Controller
 *
 * Decides what deserves processing. The "discipline" layer.
 * Weak agents react to everything. Strong agents filter.
 *
 * Functions:
 * - Should this input be processed at all?
 * - How deep should we think about it?
 * - Is this a distraction from current goals?
 */

class AttentionController {
  constructor({ focusThreshold = 0.3, depthLevels = 3 } = {}) {
    this.focusThreshold = focusThreshold;
    this.depthLevels = depthLevels;
    this.recentInputs = []; // track to detect repetition/spam
    this.maxRecent = 20;
  }

  /**
   * Evaluate whether input should be processed and at what depth.
   *
   * Returns:
   *   { process: boolean, depth: 'shallow'|'normal'|'deep', reason: string }
   */
  evaluate(input, goalRelevance, personality) {
    // Track for repetition detection
    this._trackInput(input);

    // Check for repetition (noise)
    const repetitionPenalty = this._repetitionScore(input);

    // Personality affects attention thresholds
    const personalityMod = this._personalityModifier(personality);

    const adjustedScore = goalRelevance - repetitionPenalty + personalityMod.relevanceBoost;
    const threshold = this.focusThreshold + personalityMod.thresholdShift;

    if (adjustedScore < threshold) {
      return {
        process: false,
        depth: 'none',
        reason: `Input relevance (${adjustedScore.toFixed(2)}) below threshold (${threshold.toFixed(2)}). Filtered as noise.`,
        score: adjustedScore
      };
    }

    // Determine depth
    let depth;
    if (adjustedScore > 0.8) {
      depth = 'deep';
    } else if (adjustedScore > 0.5) {
      depth = 'normal';
    } else {
      depth = 'shallow';
    }

    // Personality can override depth
    if (personality?.attentionStyle === 'thorough') {
      depth = depth === 'shallow' ? 'normal' : 'deep';
    } else if (personality?.attentionStyle === 'quick') {
      depth = depth === 'deep' ? 'normal' : 'shallow';
    }

    return {
      process: true,
      depth,
      reason: `Relevance: ${adjustedScore.toFixed(2)}, processing at ${depth} depth.`,
      score: adjustedScore
    };
  }

  _trackInput(input) {
    this.recentInputs.push(input.slice(0, 200));
    if (this.recentInputs.length > this.maxRecent) {
      this.recentInputs.shift();
    }
  }

  _repetitionScore(input) {
    const normalized = input.toLowerCase().trim();
    const similar = this.recentInputs.filter(prev => {
      const prevNorm = prev.toLowerCase().trim();
      return prevNorm === normalized || this._similarity(prevNorm, normalized) > 0.8;
    });
    return Math.min(0.5, similar.length * 0.15);
  }

  _similarity(a, b) {
    const setA = new Set(a.split(/\s+/));
    const setB = new Set(b.split(/\s+/));
    const intersection = [...setA].filter(x => setB.has(x)).length;
    const union = new Set([...setA, ...setB]).size;
    return union === 0 ? 0 : intersection / union;
  }

  _personalityModifier(personality) {
    if (!personality) return { relevanceBoost: 0, thresholdShift: 0 };

    const mods = {
      achiever:    { relevanceBoost: 0.05, thresholdShift: 0.1 },   // focused, ignores more
      thinker:     { relevanceBoost: 0.0,  thresholdShift: -0.1 },  // considers more
      opportunist: { relevanceBoost: 0.1,  thresholdShift: -0.15 }, // scans broadly
      guardian:    { relevanceBoost: -0.05, thresholdShift: 0.05 },  // careful, filters more
      catalyst:    { relevanceBoost: 0.08, thresholdShift: -0.05 },  // creative, open
    };

    return mods[personality?.archetype] || { relevanceBoost: 0, thresholdShift: 0 };
  }

  reset() {
    this.recentInputs = [];
  }
}

module.exports = { AttentionController };
