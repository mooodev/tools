/**
 * CLAW-X Team Engine
 *
 * Assembles teams from agents, appoints a leader, manages team goals.
 * The leader agent coordinates other agents based on its leadership style.
 *
 * Architecture:
 *   - A Team has N agents + 1 leader (who is also an agent)
 *   - The leader defines team goals that trickle down to agents
 *   - Each agent processes messages and the leader synthesizes responses
 *   - Team stats track performance across all agents
 */

const { CognitiveLoop } = require('./cognitive-loop');
const { getLeadershipStyle } = require('./leadership');

class TeamGoal {
  constructor({ description, priority = 0.7, assignedTo = [], createdBy = 'leader' }) {
    this.id = crypto.randomUUID?.() ?? Math.random().toString(36).slice(2);
    this.description = description;
    this.priority = priority;
    this.status = 'active'; // 'active' | 'completed' | 'abandoned'
    this.progress = 0;
    this.assignedTo = assignedTo; // agent IDs, empty = all
    this.createdBy = createdBy;   // 'leader' | 'user'
    this.createdAt = Date.now();
    this.completedAt = null;
    this.notes = [];
  }
}

class Team {
  constructor({ name, leadershipStyle = 'commander', apiKey, model, provider }) {
    this.id = crypto.randomUUID?.() ?? Math.random().toString(36).slice(2);
    this.name = name || 'Unnamed Team';
    this.leadershipStyle = getLeadershipStyle(leadershipStyle);
    this.apiKey = apiKey;
    this.model = model || 'gpt-4o-mini';
    this.provider = provider || 'openai';

    this.leader = null;       // CognitiveLoop instance (the leader agent)
    this.leaderId = null;
    this.agents = new Map();  // id -> { agent: CognitiveLoop, personality, role, stats }
    this.teamGoals = [];      // TeamGoal[]
    this.conversationLog = []; // full team conversation history
    this.stats = {
      totalMessages: 0,
      totalResponses: 0,
      agentContributions: {},  // agentId -> count
      goalCompletions: 0,
      startedAt: Date.now()
    };
  }

  /**
   * Add an agent to the team.
   */
  addAgent(personality, role = 'member') {
    const agent = new CognitiveLoop({
      personality,
      apiKey: this.apiKey,
      model: this.model,
      provider: this.provider
    });
    const agentId = crypto.randomUUID?.() ?? Math.random().toString(36).slice(2);

    this.agents.set(agentId, {
      agent,
      personality,
      role,
      id: agentId,
      stats: { messages: 0, contributions: 0, goalProgress: 0 }
    });
    this.stats.agentContributions[agentId] = 0;
    return { id: agentId, personality, role };
  }

  /**
   * Appoint a leader from existing agents or create a new one.
   */
  appointLeader(personality) {
    const agent = new CognitiveLoop({
      personality,
      apiKey: this.apiKey,
      model: this.model,
      provider: this.provider
    });
    const leaderId = crypto.randomUUID?.() ?? Math.random().toString(36).slice(2);

    // Inject leadership context into the leader's goal engine
    agent.setGoal(`Lead the team as ${this.leadershipStyle.name}. ${this.leadershipStyle.systemPromptAddition.slice(0, 200)}`, 'long', 1.0);

    this.leader = agent;
    this.leaderId = leaderId;
    this.agents.set(leaderId, {
      agent,
      personality,
      role: 'leader',
      id: leaderId,
      stats: { messages: 0, contributions: 0, goalProgress: 0 }
    });
    this.stats.agentContributions[leaderId] = 0;
    return { id: leaderId, personality, role: 'leader' };
  }

  /**
   * Set a team goal. Can be set by leader or user.
   */
  addTeamGoal({ description, priority = 0.7, assignedTo = [], createdBy = 'user' }) {
    const goal = new TeamGoal({ description, priority, assignedTo, createdBy });
    this.teamGoals.push(goal);

    // Propagate goal to assigned agents (or all if none specified)
    const targetAgents = assignedTo.length > 0
      ? assignedTo.map(id => this.agents.get(id)).filter(Boolean)
      : [...this.agents.values()];

    for (const entry of targetAgents) {
      entry.agent.setGoal(description, 'current', priority);
    }

    return goal;
  }

  /**
   * Update a team goal (user can edit).
   */
  updateTeamGoal(goalId, updates) {
    const goal = this.teamGoals.find(g => g.id === goalId);
    if (!goal) return null;

    if (updates.description !== undefined) goal.description = updates.description;
    if (updates.priority !== undefined) goal.priority = updates.priority;
    if (updates.status !== undefined) {
      goal.status = updates.status;
      if (updates.status === 'completed') {
        goal.completedAt = Date.now();
        this.stats.goalCompletions++;
      }
    }
    if (updates.progress !== undefined) goal.progress = Math.min(1, Math.max(0, updates.progress));
    if (updates.note) goal.notes.push({ text: updates.note, timestamp: Date.now() });

    return goal;
  }

  /**
   * Remove a team goal.
   */
  removeTeamGoal(goalId) {
    this.teamGoals = this.teamGoals.filter(g => g.id !== goalId);
  }

  /**
   * Process a message through the team.
   * The leader coordinates how agents respond based on leadership style.
   */
  async processMessage(userMessage) {
    if (!this.leader) {
      return { error: 'No leader appointed. Appoint a leader first.' };
    }

    this.stats.totalMessages++;
    const teamTrace = {
      timestamp: Date.now(),
      userMessage: userMessage.slice(0, 200),
      agentResponses: [],
      leaderSynthesis: null,
      leadershipStyle: this.leadershipStyle.id
    };

    // Gather agent responses based on leadership style
    const agentResponses = [];
    const style = this.leadershipStyle;

    // Get active team goals for context
    const activeGoals = this.teamGoals.filter(g => g.status === 'active');
    const goalsContext = activeGoals.length > 0
      ? activeGoals.map(g => `[P:${g.priority}] ${g.description} (${Math.round(g.progress * 100)}%)`).join('\n')
      : 'No team goals set.';

    // Collect responses from team members (not the leader)
    const memberEntries = [...this.agents.entries()].filter(([id]) => id !== this.leaderId);

    // For chaotic leadership, shuffle the agents
    if (style.traits.decisionStyle === 'chaotic') {
      memberEntries.sort(() => Math.random() - 0.5);
    }

    // Based on delegation level, decide how many agents participate
    const participationCount = Math.max(1, Math.ceil(memberEntries.length * style.traits.delegationLevel));
    const participants = memberEntries.slice(0, participationCount);

    // Process through each participating agent
    for (const [agentId, entry] of participants) {
      try {
        const result = await entry.agent.process(userMessage);
        entry.stats.messages++;
        entry.stats.contributions++;
        this.stats.agentContributions[agentId] = (this.stats.agentContributions[agentId] || 0) + 1;

        agentResponses.push({
          agentId,
          personality: entry.personality,
          role: entry.role,
          response: result.response,
          filtered: result.filtered,
          trace: result.trace
        });

        teamTrace.agentResponses.push({
          agentId,
          personality: entry.personality,
          responseLength: result.response.length,
          filtered: result.filtered
        });
      } catch (err) {
        agentResponses.push({
          agentId,
          personality: entry.personality,
          role: entry.role,
          response: `[ERROR] ${err.message}`,
          filtered: false,
          error: true
        });
      }
    }

    // Leader synthesizes all responses
    const synthesisPrompt = this._buildSynthesisPrompt(userMessage, agentResponses, goalsContext);
    const leaderResult = await this.leader.process(synthesisPrompt);

    const leaderEntry = this.agents.get(this.leaderId);
    if (leaderEntry) {
      leaderEntry.stats.messages++;
      leaderEntry.stats.contributions++;
    }
    this.stats.totalResponses++;

    teamTrace.leaderSynthesis = {
      responseLength: leaderResult.response.length,
      agentsConsulted: agentResponses.length
    };

    // Log to conversation history
    this.conversationLog.push({
      role: 'user',
      content: userMessage,
      timestamp: Date.now()
    });
    this.conversationLog.push({
      role: 'team',
      content: leaderResult.response,
      agentInputs: agentResponses.map(r => ({
        agentId: r.agentId,
        personality: r.personality,
        response: r.response.slice(0, 300)
      })),
      timestamp: Date.now()
    });

    // Trim conversation log
    if (this.conversationLog.length > 100) {
      this.conversationLog = this.conversationLog.slice(-100);
    }

    return {
      response: leaderResult.response,
      agentResponses,
      trace: teamTrace,
      state: this.getState()
    };
  }

  /**
   * Build the synthesis prompt for the leader based on leadership style.
   */
  _buildSynthesisPrompt(userMessage, agentResponses, goalsContext) {
    const style = this.leadershipStyle;
    const parts = [];

    parts.push(`You are the TEAM LEADER with the style: "${style.name}".`);
    parts.push(style.systemPromptAddition);

    parts.push(`\n## TEAM GOALS\n${goalsContext}`);

    parts.push('\n## TEAM MEMBER RESPONSES');
    parts.push('Your team has responded to the user\'s message. Synthesize their input based on your leadership style.\n');

    for (const resp of agentResponses) {
      const label = resp.filtered ? '(FILTERED)' : '';
      parts.push(`**Agent [${resp.personality}]** ${label}:`);
      parts.push(resp.response.slice(0, 500));
      parts.push('');
    }

    parts.push(`\n## ORIGINAL USER MESSAGE\n"${userMessage}"`);

    // Style-specific synthesis instructions
    switch (style.traits.decisionStyle) {
      case 'authoritarian':
        parts.push('\n## YOUR TASK\nReview the team\'s input, then give YOUR definitive answer. You decide. Be direct and commanding.');
        break;
      case 'democratic':
        parts.push('\n## YOUR TASK\nSummarize all perspectives fairly. Note areas of agreement and disagreement. Present the majority view as the team\'s answer, but acknowledge dissenting views.');
        break;
      case 'mentoring':
        parts.push('\n## YOUR TASK\nHighlight which team members contributed well and where they could improve. Build on the best responses. Give constructive feedback woven into your answer.');
        break;
      case 'strategic':
        parts.push('\n## YOUR TASK\nConnect the team\'s responses to the bigger picture. Extract the strategic insight. Inspire the team with where this leads. Focus on vision, not details.');
        break;
      case 'chaotic':
        parts.push('\n## YOUR TASK\nPick the most unexpected or creative response and run with it. Throw in a wildcard idea of your own. Keep things unpredictable and exciting!');
        break;
      default:
        parts.push('\n## YOUR TASK\nSynthesize the team responses into a cohesive, well-reasoned answer.');
    }

    return parts.join('\n');
  }

  /**
   * Get full team state for UI display.
   */
  getState() {
    const agentStates = [];
    for (const [id, entry] of this.agents) {
      agentStates.push({
        id,
        personality: entry.agent.personality.archetype,
        name: entry.agent.personality.name,
        emoji: entry.agent.personality.emoji,
        role: entry.role,
        stats: entry.stats,
        cognitiveState: entry.agent.getState()
      });
    }

    return {
      teamId: this.id,
      teamName: this.name,
      leadershipStyle: {
        id: this.leadershipStyle.id,
        name: this.leadershipStyle.name,
        emoji: this.leadershipStyle.emoji
      },
      leaderId: this.leaderId,
      agents: agentStates,
      goals: this.teamGoals.map(g => ({
        id: g.id,
        description: g.description,
        priority: g.priority,
        status: g.status,
        progress: g.progress,
        assignedTo: g.assignedTo,
        createdBy: g.createdBy,
        notesCount: g.notes.length
      })),
      stats: {
        ...this.stats,
        agentCount: this.agents.size,
        activeGoals: this.teamGoals.filter(g => g.status === 'active').length,
        completedGoals: this.teamGoals.filter(g => g.status === 'completed').length,
        uptimeMinutes: Math.round((Date.now() - this.stats.startedAt) / 60000)
      }
    };
  }

  /**
   * Get detailed statistics for visualization.
   */
  getDetailedStats() {
    const agentStats = [];
    for (const [id, entry] of this.agents) {
      const meta = entry.agent.meta.getSelfAssessment();
      const memStats = entry.agent.memory.stats;
      agentStats.push({
        id,
        personality: entry.agent.personality.archetype,
        name: entry.agent.personality.name,
        emoji: entry.agent.personality.emoji,
        role: entry.role,
        messages: entry.stats.messages,
        contributions: entry.stats.contributions,
        successRate: meta.successRate,
        totalActions: meta.totalActions,
        memoryCount: memStats.total,
        memoryBreakdown: memStats
      });
    }

    // Goal timeline
    const goalTimeline = this.teamGoals.map(g => ({
      id: g.id,
      description: g.description,
      status: g.status,
      progress: g.progress,
      createdAt: g.createdAt,
      completedAt: g.completedAt,
      durationMinutes: g.completedAt
        ? Math.round((g.completedAt - g.createdAt) / 60000)
        : Math.round((Date.now() - g.createdAt) / 60000)
    }));

    // Contribution distribution
    const contributions = {};
    for (const [id, entry] of this.agents) {
      contributions[entry.agent.personality.name] = entry.stats.contributions;
    }

    return {
      agents: agentStats,
      goalTimeline,
      contributions,
      totalMessages: this.stats.totalMessages,
      totalResponses: this.stats.totalResponses,
      goalCompletions: this.stats.goalCompletions,
      uptimeMinutes: Math.round((Date.now() - this.stats.startedAt) / 60000)
    };
  }
}

module.exports = { Team, TeamGoal };
