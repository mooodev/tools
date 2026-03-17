const express = require('express');
const path = require('path');
const { CognitiveLoop } = require('./engine/cognitive-loop');
const { listPersonalities } = require('./engine/personalities');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// In-memory session store (per API key hash)
const sessions = new Map();

function getOrCreateSession(sessionId, config = {}) {
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, new CognitiveLoop(config));
  }
  return sessions.get(sessionId);
}

// --- API Routes ---

// List available personalities
app.get('/api/personalities', (_req, res) => {
  res.json(listPersonalities());
});

// Create / reset a session
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

// Chat with the agent
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

// Set a goal
app.post('/api/goals', (req, res) => {
  const { sessionId, description, tier, priority } = req.body;
  const agent = sessions.get(sessionId);
  if (!agent) return res.status(404).json({ error: 'Session not found' });

  const goal = agent.setGoal(description, tier || 'current', priority || 0.7);
  res.json({ ok: true, goal, state: agent.getState() });
});

// Add a memory
app.post('/api/memory', (req, res) => {
  const { sessionId, content, type, tags } = req.body;
  const agent = sessions.get(sessionId);
  if (!agent) return res.status(404).json({ error: 'Session not found' });

  const mem = agent.addMemory(content, type || 'semantic', tags || []);
  res.json({ ok: true, memory: { id: mem.id, type: mem.type, content: mem.content }, state: agent.getState() });
});

// Get current state
app.get('/api/state/:sessionId', (req, res) => {
  const agent = sessions.get(req.params.sessionId);
  if (!agent) return res.status(404).json({ error: 'Session not found' });
  res.json(agent.getState());
});

// Reset session
app.post('/api/reset', (req, res) => {
  const { sessionId } = req.body;
  const agent = sessions.get(sessionId);
  if (!agent) return res.status(404).json({ error: 'Session not found' });
  agent.reset();
  res.json({ ok: true, state: agent.getState() });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`CLAW-X server running on http://localhost:${PORT}`);
});
