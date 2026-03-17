/**
 * CLAW-X Meta-Cognition Layer
 *
 * Self-monitoring: "Am I on track? Am I repeating mistakes? Is there a better way?"
 * This is the key to "smart" behavior — the agent watches its own thinking.
 */

class MetaCognition {
  constructor() {
    this.actionLog = [];
    this.reflections = [];
    this.errorPatterns = [];
    this.maxLog = 50;
  }

  /**
   * Log an action and its outcome for self-monitoring.
   */
  logAction({ action, outcome, goalId = null, success = null }) {
    this.actionLog.push({
      action,
      outcome,
      goalId,
      success,
      timestamp: Date.now()
    });
    if (this.actionLog.length > this.maxLog) {
      this.actionLog.shift();
    }

    // Detect repeated failures
    if (success === false) {
      this._detectErrorPattern(action, outcome);
    }
  }

  /**
   * Generate self-reflection prompts based on recent behavior.
   * These are injected into the cognitive loop to keep the agent on track.
   */
  generateReflection(currentGoal) {
    const prompts = [];

    // Check goal drift
    if (currentGoal) {
      const recentActions = this.actionLog.slice(-5);
      const goalWords = new Set(currentGoal.toLowerCase().split(/\s+/).filter(w => w.length > 3));
      const actionWords = recentActions.flatMap(a => a.action.toLowerCase().split(/\s+/));
      const overlap = actionWords.filter(w => goalWords.has(w)).length;
      if (overlap === 0 && recentActions.length >= 3) {
        prompts.push('DRIFT WARNING: Recent actions seem unrelated to current goal. Refocus.');
      }
    }

    // Check for repeated errors
    if (this.errorPatterns.length > 0) {
      const recent = this.errorPatterns.slice(-3);
      prompts.push(`ERROR PATTERNS DETECTED: ${recent.map(e => e.pattern).join('; ')}. Avoid repeating.`);
    }

    // Check for action loops (doing same thing repeatedly)
    const last5 = this.actionLog.slice(-5).map(a => a.action);
    const unique = new Set(last5);
    if (last5.length >= 4 && unique.size <= 2) {
      prompts.push('LOOP DETECTED: Repeating same actions. Try a different approach.');
    }

    // Success rate check
    const recentOutcomes = this.actionLog.slice(-10).filter(a => a.success !== null);
    if (recentOutcomes.length >= 5) {
      const rate = recentOutcomes.filter(a => a.success).length / recentOutcomes.length;
      if (rate < 0.3) {
        prompts.push('LOW SUCCESS RATE: Most recent actions are failing. Reconsider strategy.');
      }
    }

    return prompts;
  }

  /**
   * Get a structured self-assessment for the LLM.
   */
  getSelfAssessment() {
    const total = this.actionLog.length;
    const successes = this.actionLog.filter(a => a.success === true).length;
    const failures = this.actionLog.filter(a => a.success === false).length;

    return {
      totalActions: total,
      successes,
      failures,
      successRate: total > 0 ? (successes / total).toFixed(2) : 'N/A',
      recentErrors: this.errorPatterns.slice(-5),
      reflections: this.reflections.slice(-3)
    };
  }

  _detectErrorPattern(action, outcome) {
    // Simple pattern: if similar action failed before
    const similar = this.actionLog.filter(
      a => a.success === false && this._isSimilar(a.action, action)
    );
    if (similar.length >= 2) {
      this.errorPatterns.push({
        pattern: `Repeated failure on: "${action.slice(0, 80)}"`,
        count: similar.length,
        timestamp: Date.now()
      });
    }
  }

  _isSimilar(a, b) {
    const wordsA = new Set(a.toLowerCase().split(/\s+/));
    const wordsB = new Set(b.toLowerCase().split(/\s+/));
    const intersection = [...wordsA].filter(x => wordsB.has(x)).length;
    return intersection / Math.max(wordsA.size, wordsB.size) > 0.5;
  }

  reset() {
    this.actionLog = [];
    this.reflections = [];
    this.errorPatterns = [];
  }
}

module.exports = { MetaCognition };
