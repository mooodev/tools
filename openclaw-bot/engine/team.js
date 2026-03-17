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
 *   - Production loop iterates until goals are reached
 *   - Agents can update goal status/progress via structured commands
 *   - Workbench: agents can compile and save files to disk
 *   - Team stats track performance across all agents
 */

const fs = require('fs');
const pathMod = require('path');
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
  constructor({ name, leadershipStyle = 'commander', apiKey, model, provider, workbenchPath = null }) {
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
      productionIterations: 0,
      filesWritten: 0,
      startedAt: Date.now()
    };

    // Workbench: directory for file output
    this.workbenchPath = workbenchPath || null;
    this._ensureWorkbench();
  }

  /**
   * Ensure the workbench directory exists.
   */
  _ensureWorkbench() {
    if (this.workbenchPath) {
      try {
        fs.mkdirSync(this.workbenchPath, { recursive: true });
      } catch (e) {
        // Ignore if already exists or permission error — will fail on write
      }
    }
  }

  /**
   * Set the workbench path (can be changed after construction).
   */
  setWorkbenchPath(dirPath) {
    this.workbenchPath = dirPath;
    this._ensureWorkbench();
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
   * Update a team goal (user or agent can edit).
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
   * Parse structured commands from agent responses.
   * Agents can embed commands like:
   *   [GOAL_PROGRESS:<goalId>:<0-100>]
   *   [GOAL_STATUS:<goalId>:<active|completed|abandoned>]
   *   [GOAL_NOTE:<goalId>:<text>]
   *   [SAVE_FILE:<filename>]<content>[/SAVE_FILE]
   *
   * Returns { cleanResponse, commands }
   */
  _parseAgentCommands(response) {
    const commands = [];
    let cleanResponse = response;

    // Parse goal progress: [GOAL_PROGRESS:<id>:<0-100>]
    const progressRegex = /\[GOAL_PROGRESS:([^\]:]+):(\d+)\]/g;
    let match;
    while ((match = progressRegex.exec(response)) !== null) {
      commands.push({ type: 'goal_progress', goalId: match[1], value: parseInt(match[2], 10) / 100 });
      cleanResponse = cleanResponse.replace(match[0], '');
    }

    // Parse goal status: [GOAL_STATUS:<id>:<status>]
    const statusRegex = /\[GOAL_STATUS:([^\]:]+):(active|completed|abandoned)\]/g;
    while ((match = statusRegex.exec(response)) !== null) {
      commands.push({ type: 'goal_status', goalId: match[1], value: match[2] });
      cleanResponse = cleanResponse.replace(match[0], '');
    }

    // Parse goal notes: [GOAL_NOTE:<id>:<text>]
    const noteRegex = /\[GOAL_NOTE:([^\]:]+):([^\]]+)\]/g;
    while ((match = noteRegex.exec(response)) !== null) {
      commands.push({ type: 'goal_note', goalId: match[1], value: match[2] });
      cleanResponse = cleanResponse.replace(match[0], '');
    }

    // Parse file saves: [SAVE_FILE:<filename>]<content>[/SAVE_FILE]
    const fileRegex = /\[SAVE_FILE:([^\]]+)\]([\s\S]*?)\[\/SAVE_FILE\]/g;
    while ((match = fileRegex.exec(response)) !== null) {
      commands.push({ type: 'save_file', filename: match[1], content: match[2].trim() });
      cleanResponse = cleanResponse.replace(match[0], '');
    }

    return { cleanResponse: cleanResponse.trim(), commands };
  }

  /**
   * Execute parsed agent commands (goal updates, file saves).
   */
  _executeAgentCommands(commands, agentId) {
    const results = [];

    for (const cmd of commands) {
      switch (cmd.type) {
        case 'goal_progress': {
          // Try matching by exact ID first, then by partial match
          const goal = this._findGoalFlexible(cmd.goalId);
          if (goal) {
            this.updateTeamGoal(goal.id, { progress: cmd.value });
            results.push({ type: 'goal_progress', goalId: goal.id, progress: cmd.value, ok: true });
          } else {
            results.push({ type: 'goal_progress', goalId: cmd.goalId, ok: false, error: 'Goal not found' });
          }
          break;
        }
        case 'goal_status': {
          const goal = this._findGoalFlexible(cmd.goalId);
          if (goal) {
            this.updateTeamGoal(goal.id, { status: cmd.value });
            results.push({ type: 'goal_status', goalId: goal.id, status: cmd.value, ok: true });
          } else {
            results.push({ type: 'goal_status', goalId: cmd.goalId, ok: false, error: 'Goal not found' });
          }
          break;
        }
        case 'goal_note': {
          const goal = this._findGoalFlexible(cmd.goalId);
          if (goal) {
            this.updateTeamGoal(goal.id, { note: `[Agent ${agentId?.slice(0, 8) || 'unknown'}] ${cmd.value}` });
            results.push({ type: 'goal_note', goalId: goal.id, ok: true });
          }
          break;
        }
        case 'save_file': {
          const result = this._saveToWorkbench(cmd.filename, cmd.content);
          results.push({ type: 'save_file', ...result });
          break;
        }
      }
    }

    return results;
  }

  /**
   * Find a goal by exact ID or by partial description match.
   */
  _findGoalFlexible(idOrKeyword) {
    // Exact ID match
    let goal = this.teamGoals.find(g => g.id === idOrKeyword);
    if (goal) return goal;

    // Partial ID match
    goal = this.teamGoals.find(g => g.id.startsWith(idOrKeyword));
    if (goal) return goal;

    // Keyword match on description (for when agents reference goals by name)
    const keyword = idOrKeyword.toLowerCase();
    goal = this.teamGoals.find(g =>
      g.status === 'active' && g.description.toLowerCase().includes(keyword)
    );
    return goal || null;
  }

  /**
   * Save content to a file in the workbench directory.
   */
  _saveToWorkbench(filename, content) {
    if (!this.workbenchPath) {
      return { ok: false, filename, error: 'No workbench path configured' };
    }

    // Security: prevent path traversal
    const safeName = pathMod.basename(filename);
    // Allow subdirectories within workbench but prevent escaping
    const relativePath = filename.replace(/\.\./g, '').replace(/^\//, '');
    const fullPath = pathMod.resolve(this.workbenchPath, relativePath);

    // Ensure the resolved path is still within workbench
    if (!fullPath.startsWith(pathMod.resolve(this.workbenchPath))) {
      return { ok: false, filename, error: 'Path traversal blocked' };
    }

    try {
      // Create subdirectories if needed
      fs.mkdirSync(pathMod.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, content, 'utf-8');
      this.stats.filesWritten++;
      return { ok: true, filename: relativePath, path: fullPath };
    } catch (e) {
      return { ok: false, filename, error: e.message };
    }
  }

  /**
   * Read a file from the workbench (for agents to reference).
   */
  readFromWorkbench(filename) {
    if (!this.workbenchPath) return null;
    const relativePath = filename.replace(/\.\./g, '').replace(/^\//, '');
    const fullPath = pathMod.resolve(this.workbenchPath, relativePath);
    if (!fullPath.startsWith(pathMod.resolve(this.workbenchPath))) return null;
    try {
      return fs.readFileSync(fullPath, 'utf-8');
    } catch (e) {
      return null;
    }
  }

  /**
   * List files in the workbench.
   */
  listWorkbenchFiles() {
    if (!this.workbenchPath) return [];
    try {
      return this._listFilesRecursive(this.workbenchPath, this.workbenchPath);
    } catch (e) {
      return [];
    }
  }

  _listFilesRecursive(dir, baseDir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
      const fullPath = pathMod.join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...this._listFilesRecursive(fullPath, baseDir));
      } else {
        files.push(pathMod.relative(baseDir, fullPath));
      }
    }
    return files;
  }

  /**
   * Process a message through the team.
   * The leader coordinates how agents respond based on leadership style.
   * Uses processAsTeamMember so agents always respond (no attention filtering).
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
      leadershipStyle: this.leadershipStyle.id,
      commandResults: []
    };

    // Gather agent responses based on leadership style
    const agentResponses = [];
    const style = this.leadershipStyle;

    // Get active team goals for context
    const activeGoals = this.teamGoals.filter(g => g.status === 'active');
    const goalsContext = this._buildGoalsContext(activeGoals);

    // Collect responses from team members (not the leader)
    const memberEntries = [...this.agents.entries()].filter(([id]) => id !== this.leaderId);

    // For chaotic leadership, shuffle the agents
    if (style.traits.decisionStyle === 'chaotic') {
      memberEntries.sort(() => Math.random() - 0.5);
    }

    // Based on delegation level, decide how many agents participate
    const participationCount = Math.max(1, Math.ceil(memberEntries.length * style.traits.delegationLevel));
    const participants = memberEntries.slice(0, participationCount);

    // Build team context message that includes goals and workbench info
    const teamContextMessage = this._buildTeamMemberPrompt(userMessage, activeGoals);

    // Process through each participating agent — using processAsTeamMember to bypass attention filter
    for (const [agentId, entry] of participants) {
      try {
        const result = await entry.agent.processAsTeamMember(teamContextMessage, {
          teamId: this.id,
          role: entry.role,
          agentId
        });
        entry.stats.messages++;
        entry.stats.contributions++;
        this.stats.agentContributions[agentId] = (this.stats.agentContributions[agentId] || 0) + 1;

        // Parse and execute any structured commands from the agent's response
        const { cleanResponse, commands } = this._parseAgentCommands(result.response);
        let commandResults = [];
        if (commands.length > 0) {
          commandResults = this._executeAgentCommands(commands, agentId);
          teamTrace.commandResults.push(...commandResults);
        }

        agentResponses.push({
          agentId,
          personality: entry.personality,
          role: entry.role,
          response: cleanResponse,
          filtered: false,
          trace: result.trace,
          commandResults
        });

        teamTrace.agentResponses.push({
          agentId,
          personality: entry.personality,
          responseLength: cleanResponse.length,
          filtered: false,
          commandsExecuted: commands.length
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

    // Leader synthesizes all responses — also uses processAsTeamMember
    const synthesisPrompt = this._buildSynthesisPrompt(userMessage, agentResponses, goalsContext);
    const leaderResult = await this.leader.processAsTeamMember(synthesisPrompt, {
      teamId: this.id,
      role: 'leader',
      agentId: this.leaderId
    });

    // Parse leader commands too (leader can also update goals and save files)
    const { cleanResponse: leaderCleanResponse, commands: leaderCommands } = this._parseAgentCommands(leaderResult.response);
    if (leaderCommands.length > 0) {
      const leaderCmdResults = this._executeAgentCommands(leaderCommands, this.leaderId);
      teamTrace.commandResults.push(...leaderCmdResults);
    }

    const leaderEntry = this.agents.get(this.leaderId);
    if (leaderEntry) {
      leaderEntry.stats.messages++;
      leaderEntry.stats.contributions++;
    }
    this.stats.totalResponses++;

    teamTrace.leaderSynthesis = {
      responseLength: leaderCleanResponse.length,
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
      content: leaderCleanResponse,
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
      response: leaderCleanResponse,
      agentResponses,
      trace: teamTrace,
      state: this.getState()
    };
  }

  /**
   * PRODUCTION LOOP: Iteratively work toward active goals.
   *
   * The loop:
   *   1. Leader evaluates current goal state and delegates tasks to team
   *   2. Team members produce work (responses, files, updates)
   *   3. Agents can update goal progress/status via structured commands
   *   4. Leader checks if goal is reached
   *   5. If not reached, leader formulates next iteration
   *   6. Repeat until all goals completed, max iterations hit, or leader abandons
   *
   * @param {Object} options
   * @param {number} options.maxIterations - Max iterations before stopping (default: 10)
   * @param {Function} options.onIteration - Called after each iteration with state
   * @returns {Object} Final result with all iteration traces
   */
  async runProductionLoop({ maxIterations = 10, onIteration = null } = {}) {
    if (!this.leader) {
      return { error: 'No leader appointed. Appoint a leader first.' };
    }

    const activeGoals = this.teamGoals.filter(g => g.status === 'active');
    if (activeGoals.length === 0) {
      return { error: 'No active goals to work on.' };
    }

    const loopTrace = {
      startedAt: Date.now(),
      iterations: [],
      finalState: null,
      completedGoals: [],
      stoppedReason: null
    };

    for (let i = 0; i < maxIterations; i++) {
      this.stats.productionIterations++;

      // Check if all goals are completed
      const remaining = this.teamGoals.filter(g => g.status === 'active');
      if (remaining.length === 0) {
        loopTrace.stoppedReason = 'all_goals_completed';
        break;
      }

      // Build iteration prompt for the leader
      const iterationPrompt = this._buildProductionIterationPrompt(remaining, i, maxIterations);

      // Run a team round
      const result = await this.processMessage(iterationPrompt);

      const iterationData = {
        iteration: i + 1,
        leaderResponse: result.response.slice(0, 500),
        agentCount: result.agentResponses.length,
        activeGoals: remaining.map(g => ({
          id: g.id,
          description: g.description,
          progress: g.progress,
          status: g.status
        })),
        commandResults: result.trace?.commandResults || [],
        timestamp: Date.now()
      };
      loopTrace.iterations.push(iterationData);

      // Check for newly completed goals
      const justCompleted = this.teamGoals.filter(
        g => g.status === 'completed' && g.completedAt > loopTrace.startedAt &&
          !loopTrace.completedGoals.includes(g.id)
      );
      for (const g of justCompleted) {
        loopTrace.completedGoals.push(g.id);
      }

      // Detect if leader wants to stop (look for stop signals in response)
      if (this._detectStopSignal(result.response)) {
        loopTrace.stoppedReason = 'leader_stopped';
        break;
      }

      // Callback for external monitoring
      if (onIteration) {
        const shouldContinue = await onIteration(iterationData, this.getState());
        if (shouldContinue === false) {
          loopTrace.stoppedReason = 'external_stop';
          break;
        }
      }

      // If last iteration
      if (i === maxIterations - 1) {
        loopTrace.stoppedReason = 'max_iterations';
      }
    }

    loopTrace.finishedAt = Date.now();
    loopTrace.durationMs = loopTrace.finishedAt - loopTrace.startedAt;
    loopTrace.finalState = this.getState();

    return {
      ok: true,
      loopTrace,
      state: this.getState(),
      completedGoals: loopTrace.completedGoals,
      stoppedReason: loopTrace.stoppedReason
    };
  }

  /**
   * Build the prompt for each production loop iteration.
   */
  _buildProductionIterationPrompt(activeGoals, iteration, maxIterations) {
    const parts = [];
    parts.push(`## PRODUCTION LOOP — Iteration ${iteration + 1}/${maxIterations}`);
    parts.push('');
    parts.push('You are working toward the following team goals:');
    for (const g of activeGoals) {
      parts.push(`  - [${g.id.slice(0, 8)}] "${g.description}" — Progress: ${Math.round(g.progress * 100)}% — Priority: ${g.priority}`);
      if (g.notes.length > 0) {
        const lastNote = g.notes[g.notes.length - 1];
        parts.push(`    Last note: ${lastNote.text}`);
      }
    }

    // Workbench context
    if (this.workbenchPath) {
      const files = this.listWorkbenchFiles();
      parts.push('');
      parts.push(`## WORKBENCH (${this.workbenchPath})`);
      if (files.length > 0) {
        parts.push(`Files: ${files.join(', ')}`);
      } else {
        parts.push('No files yet. You can create files using [SAVE_FILE:filename]content[/SAVE_FILE] commands.');
      }
    }

    parts.push('');
    parts.push('## INSTRUCTIONS');
    parts.push('Work toward completing these goals. You can:');
    parts.push('  - Produce content, analysis, or work product');
    parts.push('  - Update goal progress: [GOAL_PROGRESS:<goalId-first-8-chars>:<0-100>]');
    parts.push('  - Mark a goal completed: [GOAL_STATUS:<goalId-first-8-chars>:completed]');
    parts.push('  - Add notes: [GOAL_NOTE:<goalId-first-8-chars>:<note text>]');
    if (this.workbenchPath) {
      parts.push('  - Save files: [SAVE_FILE:path/to/file.ext]file content here[/SAVE_FILE]');
    }
    parts.push('  - Signal to stop the loop: [PRODUCTION_STOP]');
    parts.push('');
    parts.push('Focus on making concrete progress. What is the next step?');

    return parts.join('\n');
  }

  /**
   * Build context message for team members (replaces raw userMessage).
   */
  _buildTeamMemberPrompt(userMessage, activeGoals) {
    const parts = [];
    parts.push('## TEAM TASK');
    parts.push(userMessage);

    if (activeGoals.length > 0) {
      parts.push('');
      parts.push('## ACTIVE TEAM GOALS');
      for (const g of activeGoals) {
        parts.push(`  - [${g.id.slice(0, 8)}] "${g.description}" — ${Math.round(g.progress * 100)}% done`);
      }
    }

    parts.push('');
    parts.push('## YOUR CAPABILITIES');
    parts.push('You can update goals and save files using structured commands:');
    parts.push('  - [GOAL_PROGRESS:<goalId-first-8-chars>:<0-100>]');
    parts.push('  - [GOAL_STATUS:<goalId-first-8-chars>:completed]');
    parts.push('  - [GOAL_NOTE:<goalId-first-8-chars>:<note>]');
    if (this.workbenchPath) {
      parts.push('  - [SAVE_FILE:filename]content[/SAVE_FILE]');
    }
    parts.push('');
    parts.push('Respond with your contribution. Be specific and actionable.');

    return parts.join('\n');
  }

  /**
   * Build goals context string.
   */
  _buildGoalsContext(activeGoals) {
    if (activeGoals.length === 0) return 'No team goals set.';
    return activeGoals.map(g =>
      `[${g.id.slice(0, 8)}] [P:${g.priority}] ${g.description} (${Math.round(g.progress * 100)}%)`
    ).join('\n');
  }

  /**
   * Detect if leader wants to stop the production loop.
   */
  _detectStopSignal(response) {
    return response.includes('[PRODUCTION_STOP]');
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
    parts.push('Your team has responded to the task. Review and synthesize their contributions.\n');

    for (const resp of agentResponses) {
      const statusTag = resp.error ? '(ERROR)' : '';
      parts.push(`**Agent [${resp.personality}]** ${statusTag}:`);
      parts.push(resp.response.slice(0, 500));
      if (resp.commandResults && resp.commandResults.length > 0) {
        parts.push(`  Actions taken: ${resp.commandResults.map(r => `${r.type}(${r.ok ? 'ok' : 'failed'})`).join(', ')}`);
      }
      parts.push('');
    }

    parts.push(`\n## ORIGINAL MESSAGE\n"${userMessage}"`);

    // Workbench context
    if (this.workbenchPath) {
      const files = this.listWorkbenchFiles();
      if (files.length > 0) {
        parts.push(`\n## WORKBENCH FILES\n${files.join(', ')}`);
      }
    }

    parts.push('\n## YOUR CAPABILITIES');
    parts.push('You can also update goals and save files:');
    parts.push('  - [GOAL_PROGRESS:<goalId>:<0-100>] / [GOAL_STATUS:<goalId>:completed] / [GOAL_NOTE:<goalId>:<text>]');
    if (this.workbenchPath) {
      parts.push('  - [SAVE_FILE:filename]content[/SAVE_FILE]');
    }

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
      workbench: {
        path: this.workbenchPath,
        files: this.listWorkbenchFiles()
      },
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
      productionIterations: this.stats.productionIterations,
      filesWritten: this.stats.filesWritten,
      workbenchFiles: this.listWorkbenchFiles(),
      uptimeMinutes: Math.round((Date.now() - this.stats.startedAt) / 60000)
    };
  }
}

module.exports = { Team, TeamGoal };
