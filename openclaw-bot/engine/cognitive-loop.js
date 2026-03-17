/**
 * CLAW-X Cognitive Loop
 *
 * The enhanced OpenClaw cycle:
 *   1. Input received
 *   2. Goal check (is this relevant?)
 *   3. Attention filter (should we process? how deep?)
 *   4. Memory retrieval (scored, not all)
 *   5. Fast hypothesis (System 1)
 *   6. Verification (System 2) — only for deep processing
 *   7. Action (LLM call)
 *   8. Result evaluation
 *   9. Memory + strategy update
 *
 * This module ties all subsystems together.
 */

const { MemorySystem, MemoryEntry } = require('./memory');
const { GoalEngine } = require('./goals');
const { AttentionController } = require('./attention');
const { MetaCognition } = require('./metacognition');
const { getPersonality } = require('./personalities');

class CognitiveLoop {
  constructor({ personality = 'achiever', apiKey, model = 'gpt-4o-mini', provider = 'openai' } = {}) {
    this.personality = getPersonality(personality);
    this.memory = new MemorySystem();
    this.goals = new GoalEngine();
    this.attention = new AttentionController();
    this.meta = new MetaCognition();
    this.apiKey = apiKey;
    this.model = model;
    this.provider = provider;
    this.conversationHistory = [];
    this.maxHistory = 20;
    this.stepLog = []; // detailed log of each cognitive step for UI
  }

  /**
   * Main processing cycle. Takes user input, returns response + cognitive trace.
   */
  async process(userInput) {
    const trace = { steps: [], timestamp: Date.now() };

    // --- Step 1: Input received ---
    trace.steps.push({ step: 'input', data: userInput.slice(0, 200) });

    // --- Step 2: Goal check ---
    const currentGoal = this.goals.getCurrentFocus();
    const goalRelevance = this.goals.scoreRelevance(userInput);
    trace.steps.push({
      step: 'goal_check',
      currentGoal: currentGoal?.description || 'None',
      relevance: goalRelevance.toFixed(2)
    });

    // --- Step 3: Attention filter ---
    const attentionResult = this.attention.evaluate(userInput, goalRelevance, this.personality);
    trace.steps.push({
      step: 'attention',
      process: attentionResult.process,
      depth: attentionResult.depth,
      reason: attentionResult.reason
    });

    // If attention filter says skip, return a brief acknowledgment
    if (!attentionResult.process) {
      const skipResponse = this._generateSkipResponse(attentionResult);
      return { response: skipResponse, trace, filtered: true };
    }

    // --- Step 4: Memory retrieval (scored) ---
    const goalDesc = currentGoal?.description || '';
    const memories = this.memory.retrieve({
      goal: goalDesc,
      query: userInput,
      topK: attentionResult.depth === 'deep' ? 8 : attentionResult.depth === 'normal' ? 5 : 3,
      types: this._getMemoryTypes()
    });
    trace.steps.push({
      step: 'memory_retrieval',
      count: memories.length,
      topMemories: memories.slice(0, 3).map(m => ({
        content: m.memory.content.slice(0, 100),
        score: m.score.toFixed(2),
        type: m.memory.type
      }))
    });

    // --- Step 5 & 6: Build prompt and call LLM ---
    const metaReflections = this.meta.generateReflection(goalDesc);
    trace.steps.push({
      step: 'meta_cognition',
      reflections: metaReflections
    });

    const systemPrompt = this._buildSystemPrompt(memories, metaReflections, attentionResult.depth);
    const response = await this._callLLM(systemPrompt, userInput);
    trace.steps.push({
      step: 'llm_response',
      depth: attentionResult.depth,
      responseLength: response.length
    });

    // --- Step 7: Evaluate and learn ---
    this._updateMemory(userInput, response, goalDesc);
    this.meta.logAction({
      action: `Processed: "${userInput.slice(0, 80)}"`,
      outcome: `Responded (${response.length} chars, depth: ${attentionResult.depth})`,
      goalId: currentGoal?.id,
      success: true
    });

    // --- Step 8: Add to conversation history ---
    this.conversationHistory.push(
      { role: 'user', content: userInput },
      { role: 'assistant', content: response }
    );
    if (this.conversationHistory.length > this.maxHistory * 2) {
      this.conversationHistory = this.conversationHistory.slice(-this.maxHistory * 2);
    }

    this.stepLog.push(trace);
    return { response, trace, filtered: false };
  }

  /**
   * Set goals for the agent.
   */
  setGoal(description, tier = 'current', priority = 0.7) {
    return this.goals.add({ description, tier, priority });
  }

  /**
   * Add a memory manually.
   */
  addMemory(content, type = 'semantic', tags = []) {
    return this.memory.store({ content, type, tags });
  }

  /**
   * Get current state for UI display.
   */
  getState() {
    return {
      personality: {
        archetype: this.personality.archetype,
        name: this.personality.name,
        emoji: this.personality.emoji
      },
      goals: this.goals.getSummary(),
      memory: this.memory.stats,
      meta: this.meta.getSelfAssessment(),
      conversationLength: this.conversationHistory.length / 2
    };
  }

  /**
   * Reset the agent.
   */
  reset() {
    this.memory.clear();
    this.goals.clear();
    this.attention.reset();
    this.meta.reset();
    this.conversationHistory = [];
    this.stepLog = [];
  }

  // --- Private methods ---

  _getMemoryTypes() {
    // Personality biases which memory types are preferred
    const bias = this.personality.memoryBias;
    const types = [];
    if (bias.semantic >= 0.3) types.push('semantic');
    if (bias.episodic >= 0.3) types.push('episodic');
    if (bias.procedural >= 0.3) types.push('procedural');
    return types.length > 0 ? types : ['semantic', 'episodic', 'procedural'];
  }

  _buildSystemPrompt(memories, metaReflections, depth) {
    const parts = [];

    // Base identity
    parts.push(`You are CLAW-X, an intelligent agent with the personality: "${this.personality.name}".`);
    parts.push(this.personality.systemPromptAddition);

    // Active goals
    const goalSummary = this.goals.getSummary();
    if (goalSummary !== 'No active goals.') {
      parts.push(`\n## ACTIVE GOALS\n${goalSummary}\nEverything you do should advance these goals.`);
    }

    // Retrieved memories (scored, not all)
    if (memories.length > 0) {
      parts.push('\n## RELEVANT MEMORIES (selected by importance)');
      memories.forEach(m => {
        const conf = m.memory.confidence >= 0.7 ? 'HIGH' : m.memory.confidence >= 0.4 ? 'MEDIUM' : 'LOW';
        const warn = m.memory.contradictions.length > 0 ? ' ⚠️ HAS CONTRADICTIONS' : '';
        parts.push(`- [${m.memory.type.toUpperCase()}] (confidence: ${conf}, score: ${m.score.toFixed(2)}${warn}) ${m.memory.content}`);
      });
    }

    // Meta-cognition warnings
    if (metaReflections.length > 0) {
      parts.push('\n## SELF-MONITORING ALERTS');
      metaReflections.forEach(r => parts.push(`⚠️ ${r}`));
    }

    // Depth instruction
    if (depth === 'deep') {
      parts.push('\n## PROCESSING DEPTH: DEEP\nThink step-by-step. Consider multiple angles. Verify your reasoning. Be thorough.');
    } else if (depth === 'shallow') {
      parts.push('\n## PROCESSING DEPTH: QUICK\nRespond concisely. Get to the point. No need for extensive analysis.');
    }

    return parts.join('\n');
  }

  async _callLLM(systemPrompt, userInput) {
    if (!this.apiKey) {
      return '[ERROR] No API key configured. Please set your API key in settings.';
    }

    try {
      // Build messages
      const messages = [
        { role: 'system', content: systemPrompt },
        ...this.conversationHistory.slice(-10),
        { role: 'user', content: userInput }
      ];

      let baseURL, headers, body;

      if (this.provider === 'anthropic') {
        baseURL = 'https://api.anthropic.com/v1/messages';
        headers = {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01'
        };
        body = JSON.stringify({
          model: this.model,
          max_tokens: 2048,
          system: systemPrompt,
          messages: [
            ...this.conversationHistory.slice(-10),
            { role: 'user', content: userInput }
          ]
        });
      } else {
        // OpenAI-compatible (OpenAI, OpenRouter, etc.)
        baseURL = this.provider === 'openrouter'
          ? 'https://openrouter.ai/api/v1/chat/completions'
          : 'https://api.openai.com/v1/chat/completions';
        headers = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        };
        body = JSON.stringify({
          model: this.model,
          messages,
          max_tokens: 2048,
          temperature: this.personality.traits.riskTolerance * 0.7 + 0.3
        });
      }

      const resp = await fetch(baseURL, { method: 'POST', headers, body });

      if (!resp.ok) {
        const err = await resp.text();
        throw new Error(`API ${resp.status}: ${err.slice(0, 300)}`);
      }

      const data = await resp.json();

      if (this.provider === 'anthropic') {
        return data.content?.[0]?.text || '[No response from Anthropic]';
      } else {
        return data.choices?.[0]?.message?.content || '[No response from LLM]';
      }
    } catch (err) {
      this.meta.logAction({
        action: 'LLM call',
        outcome: `Error: ${err.message}`,
        success: false
      });
      return `[LLM ERROR] ${err.message}`;
    }
  }

  _updateMemory(input, response, goal) {
    // Store episodic memory of this interaction
    this.memory.store({
      content: `User asked: "${input.slice(0, 100)}" → Responded about: ${response.slice(0, 100)}`,
      type: 'episodic',
      confidence: 0.6,
      source: 'conversation',
      tags: goal ? goal.split(/\s+/).slice(0, 5) : []
    });

    // If response contains a strategy or lesson, store as procedural
    const strategyMarkers = ['should', 'strategy', 'approach', 'method', 'to solve', 'pattern'];
    if (strategyMarkers.some(m => response.toLowerCase().includes(m))) {
      this.memory.store({
        content: `Strategy from conversation: ${response.slice(0, 200)}`,
        type: 'procedural',
        confidence: 0.5,
        source: 'derived',
        tags: ['strategy']
      });
    }
  }

  _generateSkipResponse(attentionResult) {
    const style = this.personality.traits.communicationStyle;
    if (style === 'direct') return "That's not relevant to our current focus. What else?";
    if (style === 'cautious') return "I've noted this but it doesn't seem to align with our active goals. Should I reconsider?";
    if (style === 'analytical') return `Filtered: ${attentionResult.reason}. Redirecting focus to active goals.`;
    return "I'm staying focused on the current objectives. Is this related to our goals?";
  }
}

module.exports = { CognitiveLoop };
