const express = require('express');
const path = require('path');
const { CognitiveLoop } = require('./engine/cognitive-loop');
const { listPersonalities } = require('./engine/personalities');
const { listLeadershipStyles } = require('./engine/leadership');
const { Team } = require('./engine/team');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// In-memory stores
const sessions = new Map();  // single-agent sessions
const teams = new Map();     // team sessions

// ========== SINGLE AGENT API ==========

app.get('/api/personalities', (_req, res) => {
  res.json(listPersonalities());
});

app.post('/api/session', (req, res) => {
  const { sessionId, personality, apiKey, model, provider } = req.body;
  if (!sessionId || !apiKey) {
    return res.status(400).json({ error: 'sessionId and apiKey are required' });
  }
  const agent = new CognitiveLoop({
    personality: personality || 'achiever',
    apiKey,
    model: model || 'gpt-4o-mini',
    provider: provider || 'openai'
  });
  sessions.set(sessionId, agent);
  res.json({ ok: true, state: agent.getState() });
});

app.post('/api/chat', async (req, res) => {
  const { sessionId, message } = req.body;
  if (!sessionId || !message) {
    return res.status(400).json({ error: 'sessionId and message are required' });
  }
  const agent = sessions.get(sessionId);
  if (!agent) {
    return res.status(404).json({ error: 'Session not found. Create one first.' });
  }
  const result = await agent.process(message);
  res.json({
    response: result.response,
    filtered: result.filtered,
    trace: result.trace,
    state: agent.getState()
  });
});

app.post('/api/goals', (req, res) => {
  const { sessionId, description, tier, priority } = req.body;
  const agent = sessions.get(sessionId);
  if (!agent) return res.status(404).json({ error: 'Session not found' });
  const goal = agent.setGoal(description, tier || 'current', priority || 0.7);
  res.json({ ok: true, goal, state: agent.getState() });
});

app.post('/api/memory', (req, res) => {
  const { sessionId, content, type, tags } = req.body;
  const agent = sessions.get(sessionId);
  if (!agent) return res.status(404).json({ error: 'Session not found' });
  const mem = agent.addMemory(content, type || 'semantic', tags || []);
  res.json({ ok: true, memory: { id: mem.id, type: mem.type, content: mem.content }, state: agent.getState() });
});

app.get('/api/state/:sessionId', (req, res) => {
  const agent = sessions.get(req.params.sessionId);
  if (!agent) return res.status(404).json({ error: 'Session not found' });
  res.json(agent.getState());
});

app.post('/api/reset', (req, res) => {
  const { sessionId } = req.body;
  const agent = sessions.get(sessionId);
  if (!agent) return res.status(404).json({ error: 'Session not found' });
  agent.reset();
  res.json({ ok: true, state: agent.getState() });
});

// ========== TEAM API ==========

// List leadership styles
app.get('/api/leadership-styles', (_req, res) => {
  res.json(listLeadershipStyles());
});

// Create a team
app.post('/api/team/create', (req, res) => {
  const { teamId, name, leadershipStyle, apiKey, model, provider } = req.body;
  if (!teamId || !apiKey) {
    return res.status(400).json({ error: 'teamId and apiKey are required' });
  }
  const team = new Team({
    name: name || 'Team Alpha',
    leadershipStyle: leadershipStyle || 'commander',
    apiKey,
    model: model || 'gpt-4o-mini',
    provider: provider || 'openai'
  });
  teams.set(teamId, team);
  res.json({ ok: true, state: team.getState() });
});

// Add an agent to a team
app.post('/api/team/add-agent', (req, res) => {
  const { teamId, personality, role } = req.body;
  const team = teams.get(teamId);
  if (!team) return res.status(404).json({ error: 'Team not found' });
  const agent = team.addAgent(personality || 'achiever', role || 'member');
  res.json({ ok: true, agent, state: team.getState() });
});

// Appoint a leader
app.post('/api/team/appoint-leader', (req, res) => {
  const { teamId, personality } = req.body;
  const team = teams.get(teamId);
  if (!team) return res.status(404).json({ error: 'Team not found' });
  const leader = team.appointLeader(personality || 'achiever');
  res.json({ ok: true, leader, state: team.getState() });
});

// Chat with the team
app.post('/api/team/chat', async (req, res) => {
  const { teamId, message } = req.body;
  if (!teamId || !message) {
    return res.status(400).json({ error: 'teamId and message are required' });
  }
  const team = teams.get(teamId);
  if (!team) return res.status(404).json({ error: 'Team not found' });

  const result = await team.processMessage(message);
  res.json(result);
});

// Add a team goal
app.post('/api/team/goals', (req, res) => {
  const { teamId, description, priority, assignedTo, createdBy } = req.body;
  const team = teams.get(teamId);
  if (!team) return res.status(404).json({ error: 'Team not found' });
  const goal = team.addTeamGoal({
    description,
    priority: priority || 0.7,
    assignedTo: assignedTo || [],
    createdBy: createdBy || 'user'
  });
  res.json({ ok: true, goal, state: team.getState() });
});

// Update a team goal
app.patch('/api/team/goals/:goalId', (req, res) => {
  const { teamId, ...updates } = req.body;
  const team = teams.get(teamId);
  if (!team) return res.status(404).json({ error: 'Team not found' });
  const goal = team.updateTeamGoal(req.params.goalId, updates);
  if (!goal) return res.status(404).json({ error: 'Goal not found' });
  res.json({ ok: true, goal, state: team.getState() });
});

// Remove a team goal
app.delete('/api/team/goals/:goalId', (req, res) => {
  const { teamId } = req.body;
  const team = teams.get(teamId);
  if (!team) return res.status(404).json({ error: 'Team not found' });
  team.removeTeamGoal(req.params.goalId);
  res.json({ ok: true, state: team.getState() });
});

// Get team state
app.get('/api/team/state/:teamId', (req, res) => {
  const team = teams.get(req.params.teamId);
  if (!team) return res.status(404).json({ error: 'Team not found' });
  res.json(team.getState());
});

// Get detailed team stats
app.get('/api/team/stats/:teamId', (req, res) => {
  const team = teams.get(req.params.teamId);
  if (!team) return res.status(404).json({ error: 'Team not found' });
  res.json(team.getDetailedStats());
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`CLAW-X server running on http://localhost:${PORT}`);
});
