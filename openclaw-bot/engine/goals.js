/**
 * CLAW-X Goal Engine
 *
 * The "will" of the agent. Goals dominate over input.
 * Three tiers: long-term, mid-term, current
 * Every input is evaluated against goal relevance.
 */

class Goal {
  constructor({ description, tier, priority = 0.5, deadline = null, parent = null }) {
    this.id = crypto.randomUUID?.() ?? Math.random().toString(36).slice(2);
    this.description = description;
    this.tier = tier; // 'long' | 'mid' | 'current'
    this.priority = priority; // 0..1
    this.deadline = deadline;
    this.parent = parent; // parent goal id for hierarchy
    this.status = 'active'; // 'active' | 'completed' | 'abandoned'
    this.progress = 0; // 0..1
    this.createdAt = Date.now();
  }
}

class GoalEngine {
  constructor() {
    this.goals = [];
  }

  add(goalData) {
    const goal = goalData instanceof Goal ? goalData : new Goal(goalData);
    this.goals.push(goal);
    return goal;
  }

  getActive(tier = null) {
    return this.goals.filter(g => {
      if (g.status !== 'active') return false;
      if (tier && g.tier !== tier) return false;
      return true;
    }).sort((a, b) => b.priority - a.priority);
  }

  getCurrentFocus() {
    // Current tasks first, then mid, then long
    const current = this.getActive('current');
    if (current.length > 0) return current[0];
    const mid = this.getActive('mid');
    if (mid.length > 0) return mid[0];
    const long = this.getActive('long');
    return long.length > 0 ? long[0] : null;
  }

  /**
   * Score how relevant an input is to active goals.
   * Returns 0..1 — used by Attention Controller to decide if input deserves processing.
   */
  scoreRelevance(input) {
    const activeGoals = this.getActive();
    if (activeGoals.length === 0) return 0.5; // no goals = accept everything

    const inputLower = input.toLowerCase();
    let maxScore = 0;

    for (const goal of activeGoals) {
      const words = goal.description.toLowerCase().split(/\s+/).filter(w => w.length > 3);
      if (words.length === 0) continue;
      const matches = words.filter(w => inputLower.includes(w)).length;
      const relevance = matches / words.length;
      const weighted = relevance * goal.priority;
      if (weighted > maxScore) maxScore = weighted;
    }

    return Math.min(1, maxScore + 0.2); // baseline relevance
  }

  complete(goalId) {
    const goal = this.goals.find(g => g.id === goalId);
    if (goal) goal.status = 'completed';
  }

  updateProgress(goalId, progress) {
    const goal = this.goals.find(g => g.id === goalId);
    if (goal) goal.progress = Math.min(1, Math.max(0, progress));
  }

  getSummary() {
    const active = this.getActive();
    if (active.length === 0) return 'No active goals.';
    return active.map(g => `[${g.tier}] ${g.description} (priority: ${g.priority}, progress: ${Math.round(g.progress * 100)}%)`).join('\n');
  }

  clear() {
    this.goals = [];
  }
}

module.exports = { GoalEngine, Goal };
