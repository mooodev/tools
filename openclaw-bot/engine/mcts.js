/**
 * CLAW-X Monte Carlo Tree Search (MCTS) Engine
 *
 * Short-term memory: explores multiple reasoning strategies within a single
 * cognitive cycle. Instead of picking one response, MCTS simulates several
 * candidate paths and selects the best via UCB1.
 *
 * Node structure:
 *   - state: the candidate action/strategy text
 *   - Q: total reward accumulated
 *   - N: visit count
 *   - prior: bias from long-term memory (speeds up convergence)
 *   - children: expanded actions
 *
 * Integration points:
 *   - Long-term memory supplies priors (via vector similarity)
 *   - Meta-cognition evaluates rollout quality
 *   - Best path feeds into LLM prompt as "chosen strategy"
 */

const EXPLORE_CONSTANT = 1.41; // sqrt(2), classic UCB1

class MCTSNode {
  constructor(state, parent = null, prior = 0.5) {
    this.state = state;
    this.parent = parent;
    this.prior = prior;
    this.children = [];
    this.Q = 0;    // total reward
    this.N = 0;    // visit count
    this.expanded = false;
  }

  get isLeaf() {
    return this.children.length === 0;
  }

  ucb1(parentN) {
    if (this.N === 0) return Infinity;
    const exploitation = this.Q / this.N;
    const exploration = EXPLORE_CONSTANT * Math.sqrt(Math.log(parentN) / this.N);
    const priorBonus = this.prior * 0.3 / (1 + this.N); // decays with visits
    return exploitation + exploration + priorBonus;
  }

  bestChild() {
    if (this.children.length === 0) return null;
    return this.children.reduce((best, child) =>
      child.ucb1(this.N) > best.ucb1(this.N) ? child : best
    );
  }

  mostVisitedChild() {
    if (this.children.length === 0) return null;
    return this.children.reduce((best, child) =>
      child.N > best.N ? child : best
    );
  }

  addChild(state, prior = 0.5) {
    const child = new MCTSNode(state, this, prior);
    this.children.push(child);
    return child;
  }
}

class MCTSEngine {
  /**
   * @param {Object} opts
   * @param {number} opts.maxIterations - simulations per search (default 30)
   * @param {number} opts.maxDepth - max tree depth (default 3)
   * @param {Function} opts.evaluator - (state, context) => reward [0..1]
   * @param {Function} opts.expander - (state, context) => string[] candidate actions
   * @param {Function} opts.priorFn - (state, context) => number [0..1] from long-term memory
   */
  constructor({ maxIterations = 30, maxDepth = 3, evaluator, expander, priorFn } = {}) {
    this.maxIterations = maxIterations;
    this.maxDepth = maxDepth;
    this.evaluator = evaluator || this._defaultEvaluator;
    this.expander = expander || this._defaultExpander;
    this.priorFn = priorFn || (() => 0.5);
  }

  /**
   * Run MCTS search from a root state.
   *
   * @param {string} rootState - the initial context/query
   * @param {Object} context - { goal, memories, personality, input }
   * @returns {{ bestAction: string, tree: MCTSNode, stats: Object }}
   */
  search(rootState, context = {}) {
    const root = new MCTSNode(rootState);
    const stats = { iterations: 0, totalDepth: 0, maxDepthReached: 0 };

    for (let i = 0; i < this.maxIterations; i++) {
      // 1. SELECT — traverse tree using UCB1
      let node = this._select(root);

      // 2. EXPAND — add children if not fully expanded
      if (!node.expanded && this._depth(node) < this.maxDepth) {
        node = this._expand(node, context);
      }

      // 3. SIMULATE — evaluate the node state
      const reward = this._simulate(node, context);

      // 4. BACKPROPAGATE — update all ancestors
      this._backpropagate(node, reward);

      const depth = this._depth(node);
      stats.totalDepth += depth;
      stats.maxDepthReached = Math.max(stats.maxDepthReached, depth);
      stats.iterations++;
    }

    stats.avgDepth = stats.iterations > 0 ? (stats.totalDepth / stats.iterations).toFixed(1) : 0;

    // Best action = most visited child (more robust than highest Q)
    const bestChild = root.mostVisitedChild();
    return {
      bestAction: bestChild ? bestChild.state : rootState,
      confidence: bestChild ? bestChild.Q / Math.max(1, bestChild.N) : 0,
      tree: root,
      alternatives: root.children
        .sort((a, b) => b.N - a.N)
        .slice(0, 5)
        .map(c => ({
          action: c.state,
          visits: c.N,
          avgReward: c.N > 0 ? (c.Q / c.N).toFixed(3) : '0',
          prior: c.prior.toFixed(2)
        })),
      stats
    };
  }

  // --- Core MCTS phases ---

  _select(node) {
    while (!node.isLeaf && node.expanded) {
      node = node.bestChild();
    }
    return node;
  }

  _expand(node, context) {
    const candidates = this.expander(node.state, context);
    for (const candidate of candidates) {
      const prior = this.priorFn(candidate, context);
      node.addChild(candidate, prior);
    }
    node.expanded = true;
    // Return a random child for simulation
    if (node.children.length > 0) {
      return node.children[Math.floor(Math.random() * node.children.length)];
    }
    return node;
  }

  _simulate(node, context) {
    return this.evaluator(node.state, context);
  }

  _backpropagate(node, reward) {
    while (node !== null) {
      node.N++;
      node.Q += reward;
      node = node.parent;
    }
  }

  _depth(node) {
    let d = 0;
    let n = node;
    while (n.parent) { d++; n = n.parent; }
    return d;
  }

  // --- Default implementations ---

  _defaultEvaluator(state, context) {
    if (!context.goal) return 0.5;
    const goalWords = context.goal.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    const stateWords = state.toLowerCase().split(/\s+/);
    if (goalWords.length === 0) return 0.5;
    const matches = goalWords.filter(w => stateWords.some(sw => sw.includes(w))).length;
    return Math.min(1, matches / goalWords.length + 0.2);
  }

  _defaultExpander(state, context) {
    // Generate candidate strategy variations
    const strategies = [
      `Analyze "${state}" step by step, breaking into sub-problems`,
      `Use existing knowledge to directly address "${state}"`,
      `Consider alternative perspectives on "${state}"`,
      `Apply procedural memory patterns to "${state}"`,
    ];

    // If memories available, add memory-informed strategies
    if (context.memories && context.memories.length > 0) {
      const topMemory = context.memories[0];
      strategies.push(
        `Apply previous experience: "${topMemory.memory?.content?.slice(0, 80) || topMemory.content?.slice(0, 80) || 'related pattern'}"`
      );
    }

    return strategies.slice(0, 4); // limit branching factor
  }
}

module.exports = { MCTSEngine, MCTSNode };
