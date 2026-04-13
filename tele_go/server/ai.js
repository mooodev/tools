// Go AI — Monte Carlo Tree Search with heuristic priors
// Provides move suggestions and game analysis

const { GoGame, EMPTY, BLACK, WHITE, opponent } = require('./game');

class MCTSNode {
  constructor(game, move = null, parent = null) {
    this.game = game;
    this.move = move;       // {x, y} or {pass: true}
    this.parent = parent;
    this.children = [];
    this.visits = 0;
    this.wins = 0;
    this.untriedMoves = null;
  }

  get ucb1() {
    if (this.visits === 0) return Infinity;
    const exploitation = this.wins / this.visits;
    const exploration = Math.sqrt(2 * Math.log(this.parent.visits) / this.visits);
    return exploitation + 1.41 * exploration;
  }

  isFullyExpanded() {
    if (this.untriedMoves === null) {
      this.untriedMoves = this.game.getLegalMoves(this.game.currentPlayer);
    }
    return this.untriedMoves.length === 0;
  }

  bestChild() {
    let best = null;
    let bestScore = -Infinity;
    for (const child of this.children) {
      const score = child.ucb1;
      if (score > bestScore) {
        bestScore = score;
        best = child;
      }
    }
    return best;
  }

  expand() {
    if (this.untriedMoves === null) {
      this.untriedMoves = this.game.getLegalMoves(this.game.currentPlayer);
    }
    if (this.untriedMoves.length === 0) return this;

    // Prioritize moves with heuristic scoring
    const scored = this.untriedMoves.map(([x, y]) => ({
      x, y,
      score: evaluateMoveHeuristic(this.game, x, y, this.game.currentPlayer)
    }));
    scored.sort((a, b) => b.score - a.score);

    // Pick from top candidates with some randomness
    const topN = Math.min(5, scored.length);
    const idx = Math.floor(Math.random() * topN);
    const chosen = scored[idx];

    // Remove from untried
    this.untriedMoves = this.untriedMoves.filter(
      ([x, y]) => !(x === chosen.x && y === chosen.y)
    );

    const newGame = this.game.clone();
    newGame.playMove(chosen.x, chosen.y);

    const child = new MCTSNode(newGame, { x: chosen.x, y: chosen.y }, this);
    this.children.push(child);
    return child;
  }
}

// Heuristic evaluation for move prioritization
function evaluateMoveHeuristic(game, x, y, color) {
  let score = 0;
  const size = game.size;

  // 1. Capture moves are very good
  const tempBoard = game.clone();
  tempBoard.board[y][x] = color;
  for (const [nx, ny] of game.neighbors(x, y)) {
    if (game.board[ny][nx] === opponent(color)) {
      const group = tempBoard.getGroup(nx, ny);
      if (group.liberties.size === 0) {
        score += group.stones.length * 15;
      }
    }
  }
  tempBoard.board[y][x] = EMPTY;

  // 2. Save own groups in atari
  for (const [nx, ny] of game.neighbors(x, y)) {
    if (game.board[ny][nx] === color) {
      const group = game.getGroup(nx, ny);
      if (group.liberties.size === 1) {
        score += group.stones.length * 12;
      }
    }
  }

  // 3. Atari opponent stones
  tempBoard.board[y][x] = color;
  for (const [nx, ny] of game.neighbors(x, y)) {
    if (game.board[ny][nx] === opponent(color)) {
      const group = tempBoard.getGroup(nx, ny);
      if (group.liberties.size === 1) {
        score += group.stones.length * 6;
      }
    }
  }
  tempBoard.board[y][x] = EMPTY;

  // 4. Proximity to existing stones (connectedness)
  for (const [nx, ny] of game.neighbors(x, y)) {
    if (game.board[ny][nx] === color) score += 3;
    if (game.board[ny][nx] === opponent(color)) score += 2;
  }

  // 5. Edge / corner preferences based on game stage
  const moveCount = game.moves.length;
  const edgeDistX = Math.min(x, size - 1 - x);
  const edgeDistY = Math.min(y, size - 1 - y);
  const edgeDist = Math.min(edgeDistX, edgeDistY);

  if (moveCount < size) {
    // Opening: prefer star points and 3rd/4th lines
    if (edgeDist >= 2 && edgeDist <= 4) score += 4;
    if (isStarPoint(x, y, size)) score += 8;
  } else {
    // Mid/endgame: less edge preference
    if (edgeDist === 0) score -= 2;
    if (edgeDist === 1) score += 1;
  }

  // 6. Avoid self-atari (unless capturing)
  tempBoard.board[y][x] = color;
  const ownGroup = tempBoard.getGroup(x, y);
  if (ownGroup.liberties.size === 1 && score < 10) {
    score -= 8;
  }
  tempBoard.board[y][x] = EMPTY;

  // 7. Eye-making potential
  let friendlyNeighbors = 0;
  let emptyNeighbors = 0;
  for (const [nx, ny] of game.neighbors(x, y)) {
    if (game.board[ny][nx] === color) friendlyNeighbors++;
    if (game.board[ny][nx] === EMPTY) emptyNeighbors++;
  }
  if (friendlyNeighbors >= 3) score += 2; // potential eye formation

  return score + Math.random() * 2; // small noise for variety
}

function isStarPoint(x, y, size) {
  const stars = {
    9: [2, 4, 6],
    13: [3, 6, 9],
    19: [3, 9, 15]
  };
  const pts = stars[size] || [];
  return pts.includes(x) && pts.includes(y);
}

// Random playout (rollout) with light heuristics
function rollout(game, maxMoves = 200) {
  const sim = game.clone();
  let moves = 0;

  while (!sim.gameOver && moves < maxMoves) {
    const legal = sim.getLegalMoves();
    if (legal.length === 0) {
      sim.pass();
      if (sim.passCount >= 2) break;
      moves++;
      continue;
    }

    // Light playout policy: prefer captures and atari escapes
    let chosen = null;
    const shuffled = shuffleArray(legal);

    for (const [x, y] of shuffled) {
      // Check if this captures
      const tempGame = sim.clone();
      tempGame.board[y][x] = sim.currentPlayer;
      let captures = false;
      for (const [nx, ny] of sim.neighbors(x, y)) {
        if (sim.board[ny][nx] === opponent(sim.currentPlayer)) {
          const group = tempGame.getGroup(nx, ny);
          if (group.liberties.size === 0) {
            captures = true;
            break;
          }
        }
      }
      tempGame.board[y][x] = EMPTY;

      if (captures) {
        chosen = [x, y];
        break;
      }
    }

    // Check for atari escape
    if (!chosen) {
      for (const [x, y] of shuffled) {
        for (const [nx, ny] of sim.neighbors(x, y)) {
          if (sim.board[ny][nx] === sim.currentPlayer) {
            const group = sim.getGroup(nx, ny);
            if (group.liberties.size === 1) {
              chosen = [x, y];
              break;
            }
          }
        }
        if (chosen) break;
      }
    }

    if (!chosen) {
      // Filter out self-atari moves and eye-filling
      const good = shuffled.filter(([x, y]) => {
        const tempG = sim.clone();
        tempG.board[y][x] = sim.currentPlayer;
        const group = tempG.getGroup(x, y);
        tempG.board[y][x] = EMPTY;

        // Avoid self-atari
        if (group.liberties.size <= 1) return false;

        // Avoid filling own eyes
        let ownCount = 0;
        for (const [nx, ny] of sim.neighbors(x, y)) {
          if (sim.board[ny][nx] === sim.currentPlayer) ownCount++;
        }
        const totalNeighbors = sim.neighbors(x, y).length;
        if (ownCount === totalNeighbors) return false;

        return true;
      });

      if (good.length > 0) {
        chosen = good[Math.floor(Math.random() * good.length)];
      } else {
        sim.pass();
        moves++;
        continue;
      }
    }

    const result = sim.playMove(chosen[0], chosen[1]);
    if (!result.success) {
      sim.pass();
    }
    moves++;
  }

  if (!sim.gameOver) {
    // Force end for scoring
    sim.territory = sim.computeTerritory();
    sim.result = sim.computeScore();
  }

  return sim.result;
}

function shuffleArray(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Main MCTS search
function mctsSearch(game, iterations = 800, timeLimit = 3000) {
  const root = new MCTSNode(game.clone());
  const startTime = Date.now();
  let i = 0;

  while (i < iterations && (Date.now() - startTime) < timeLimit) {
    // Selection
    let node = root;
    while (!node.game.gameOver && node.isFullyExpanded() && node.children.length > 0) {
      node = node.bestChild();
    }

    // Expansion
    if (!node.game.gameOver && !node.isFullyExpanded()) {
      node = node.expand();
    }

    // Simulation (rollout)
    const result = rollout(node.game);

    // Backpropagation
    let current = node;
    while (current !== null) {
      current.visits++;
      if (result && result.winner === game.currentPlayer) {
        current.wins++;
      }
      current = current.parent;
    }

    i++;
  }

  // Select best move (most visited)
  if (root.children.length === 0) {
    return { move: null, pass: true, confidence: 0, iterations: i };
  }

  root.children.sort((a, b) => b.visits - a.visits);

  const bestMoves = root.children.slice(0, 5).map(c => ({
    x: c.move.x,
    y: c.move.y,
    visits: c.visits,
    winRate: c.visits > 0 ? (c.wins / c.visits * 100).toFixed(1) : 0,
    score: c.visits
  }));

  const best = root.children[0];

  return {
    move: best.move,
    confidence: best.wins / best.visits,
    winRate: (best.wins / best.visits * 100).toFixed(1),
    iterations: i,
    topMoves: bestMoves
  };
}

// Get AI move suggestion with difficulty levels
function getAISuggestion(game, difficulty = 'medium') {
  const configs = {
    easy: { iterations: 200, timeLimit: 1000 },
    medium: { iterations: 600, timeLimit: 2500 },
    hard: { iterations: 1200, timeLimit: 5000 }
  };

  const config = configs[difficulty] || configs.medium;

  // Scale iterations for board size
  const scaleFactor = game.size <= 9 ? 1.5 : game.size <= 13 ? 1.0 : 0.7;
  const iters = Math.round(config.iterations * scaleFactor);

  return mctsSearch(game, iters, config.timeLimit);
}

// Analyze a completed game move-by-move
function analyzeGame(game) {
  const analysis = {
    moves: [],
    summary: {
      totalMoves: game.moves.length,
      captures: { ...game.captures },
      result: game.result,
      duration: game.endTime ? game.endTime - game.startTime : null
    },
    phases: {
      opening: { start: 0, end: 0 },
      middleGame: { start: 0, end: 0 },
      endGame: { start: 0, end: 0 }
    },
    mistakes: [],
    goodMoves: [],
    scoreProgression: []
  };

  // Determine game phases
  const totalMoves = game.moves.length;
  const openingEnd = Math.min(Math.floor(game.size * 2), totalMoves);
  const midEnd = Math.min(Math.floor(totalMoves * 0.7), totalMoves);
  analysis.phases.opening = { start: 0, end: openingEnd };
  analysis.phases.middleGame = { start: openingEnd, end: midEnd };
  analysis.phases.endGame = { start: midEnd, end: totalMoves };

  // Replay game and evaluate positions
  const replay = new GoGame(game.size, game.komi);
  let prevScore = 0;

  for (let i = 0; i < game.moves.length; i++) {
    const move = game.moves[i];

    if (move.pass) {
      analysis.moves.push({
        moveNumber: i + 1,
        color: move.color,
        pass: true,
        scoreDelta: 0,
        quality: 'neutral'
      });
      replay.pass(move.color);
      continue;
    }

    // Get AI suggestion for this position (quick analysis)
    const suggestion = mctsSearch(replay.clone(), 150, 500);
    const currentScore = replay.estimateScore();
    const scoreDelta = move.color === BLACK
      ? currentScore.lead - prevScore
      : prevScore - currentScore.lead;

    // Play the actual move
    replay.playMove(move.x, move.y, move.color);

    const afterScore = replay.estimateScore();
    const actualDelta = move.color === BLACK
      ? afterScore.lead - currentScore.lead
      : currentScore.lead - afterScore.lead;

    let quality = 'neutral';
    let isSuggested = suggestion.move &&
      suggestion.move.x === move.x && suggestion.move.y === move.y;

    if (isSuggested || actualDelta > 2) {
      quality = 'good';
    } else if (actualDelta < -5) {
      quality = 'mistake';
      analysis.mistakes.push({
        moveNumber: i + 1,
        color: move.color,
        played: { x: move.x, y: move.y },
        suggested: suggestion.move,
        scoreLoss: Math.abs(actualDelta)
      });
    } else if (actualDelta > 3) {
      quality = 'excellent';
      analysis.goodMoves.push({
        moveNumber: i + 1,
        color: move.color,
        move: { x: move.x, y: move.y }
      });
    }

    analysis.moves.push({
      moveNumber: i + 1,
      x: move.x,
      y: move.y,
      color: move.color,
      quality,
      suggestedMove: suggestion.move,
      captures: move.captures.length,
      scoreDelta: actualDelta.toFixed(1)
    });

    analysis.scoreProgression.push({
      move: i + 1,
      blackScore: afterScore.blackScore,
      whiteScore: afterScore.whiteScore,
      lead: afterScore.lead
    });

    prevScore = afterScore.lead;
  }

  return analysis;
}

module.exports = { mctsSearch, getAISuggestion, analyzeGame, evaluateMoveHeuristic };
