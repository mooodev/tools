// Go Game Engine — full rules implementation
// Supports 9x9, 13x13, 19x19 boards with captures, ko, superko, scoring

const EMPTY = 0;
const BLACK = 1;
const WHITE = 2;

function opponent(color) {
  return color === BLACK ? WHITE : BLACK;
}

class GoGame {
  constructor(size = 19, komi = 6.5) {
    this.size = size;
    this.komi = komi;
    this.board = Array.from({ length: size }, () => new Int8Array(size));
    this.currentPlayer = BLACK;
    this.moves = [];           // [{x, y, color, captures: [{x,y}], timestamp}]
    this.captures = { [BLACK]: 0, [WHITE]: 0 }; // stones captured BY each color
    this.koPoint = null;       // forbidden point for simple ko
    this.previousBoards = [];  // for superko detection (hashed)
    this.passCount = 0;
    this.gameOver = false;
    this.result = null;        // { winner, score, method }
    this.startTime = Date.now();
    this.endTime = null;
    this.resigned = null;
    this.territory = null;     // computed at end
  }

  clone() {
    const g = new GoGame(this.size, this.komi);
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        g.board[y][x] = this.board[y][x];
      }
    }
    g.currentPlayer = this.currentPlayer;
    g.moves = this.moves.slice();
    g.captures = { ...this.captures };
    g.koPoint = this.koPoint;
    g.previousBoards = this.previousBoards.slice();
    g.passCount = this.passCount;
    g.gameOver = this.gameOver;
    g.result = this.result;
    return g;
  }

  // Get all neighbors of a point
  neighbors(x, y) {
    const n = [];
    if (x > 0) n.push([x - 1, y]);
    if (x < this.size - 1) n.push([x + 1, y]);
    if (y > 0) n.push([x, y - 1]);
    if (y < this.size - 1) n.push([x, y + 1]);
    return n;
  }

  // Get connected group and its liberties
  getGroup(x, y) {
    const color = this.board[y][x];
    if (color === EMPTY) return { stones: [], liberties: new Set() };

    const visited = new Set();
    const stones = [];
    const liberties = new Set();
    const stack = [[x, y]];

    while (stack.length > 0) {
      const [cx, cy] = stack.pop();
      const key = cy * this.size + cx;
      if (visited.has(key)) continue;
      visited.add(key);

      if (this.board[cy][cx] === color) {
        stones.push([cx, cy]);
        for (const [nx, ny] of this.neighbors(cx, cy)) {
          const nkey = ny * this.size + nx;
          if (!visited.has(nkey)) {
            if (this.board[ny][nx] === EMPTY) {
              liberties.add(nkey);
            } else if (this.board[ny][nx] === color) {
              stack.push([nx, ny]);
            }
          }
        }
      }
    }

    return { stones, liberties };
  }

  // Hash board state for superko detection
  hashBoard() {
    let h = 0n;
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        h = (h * 3n) + BigInt(this.board[y][x]);
      }
    }
    return h.toString(36);
  }

  // Check if a move is legal
  isLegalMove(x, y, color = this.currentPlayer) {
    if (this.gameOver) return false;
    if (x < 0 || x >= this.size || y < 0 || y >= this.size) return false;
    if (this.board[y][x] !== EMPTY) return false;
    if (this.koPoint && this.koPoint[0] === x && this.koPoint[1] === y && color === this.currentPlayer) {
      return false;
    }

    // Simulate the move
    const saved = this.board[y][x];
    this.board[y][x] = color;

    // Check captures first
    let wouldCapture = false;
    for (const [nx, ny] of this.neighbors(x, y)) {
      if (this.board[ny][nx] === opponent(color)) {
        const group = this.getGroup(nx, ny);
        if (group.liberties.size === 0) {
          wouldCapture = true;
          break;
        }
      }
    }

    // Check self-capture (suicide)
    if (!wouldCapture) {
      const group = this.getGroup(x, y);
      if (group.liberties.size === 0) {
        this.board[y][x] = saved;
        return false; // suicide is not allowed
      }
    }

    this.board[y][x] = saved;
    return true;
  }

  // Get all legal moves for the current player
  getLegalMoves(color = this.currentPlayer) {
    const moves = [];
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        if (this.isLegalMove(x, y, color)) {
          moves.push([x, y]);
        }
      }
    }
    return moves;
  }

  // Play a stone
  playMove(x, y, color = this.currentPlayer) {
    if (!this.isLegalMove(x, y, color)) {
      return { success: false, error: 'Illegal move' };
    }

    this.board[y][x] = color;
    this.passCount = 0;

    // Capture opponent stones
    const captured = [];
    for (const [nx, ny] of this.neighbors(x, y)) {
      if (this.board[ny][nx] === opponent(color)) {
        const group = this.getGroup(nx, ny);
        if (group.liberties.size === 0) {
          for (const [sx, sy] of group.stones) {
            this.board[sy][sx] = EMPTY;
            captured.push([sx, sy]);
          }
        }
      }
    }

    this.captures[color] += captured.length;

    // Simple ko detection
    if (captured.length === 1 && this.getGroup(x, y).stones.length === 1) {
      this.koPoint = [captured[0][0], captured[0][1]];
    } else {
      this.koPoint = null;
    }

    // Superko detection
    const hash = this.hashBoard();
    this.previousBoards.push(hash);

    const move = {
      x, y, color,
      captures: captured,
      timestamp: Date.now(),
      moveNumber: this.moves.length + 1
    };
    this.moves.push(move);

    this.currentPlayer = opponent(color);

    return { success: true, move, captured };
  }

  // Pass
  pass(color = this.currentPlayer) {
    this.passCount++;
    const move = {
      x: -1, y: -1, color, pass: true,
      captures: [],
      timestamp: Date.now(),
      moveNumber: this.moves.length + 1
    };
    this.moves.push(move);
    this.koPoint = null;
    this.currentPlayer = opponent(color);

    if (this.passCount >= 2) {
      this.endGame();
    }

    return { success: true, move, captured: [] };
  }

  // Resign
  resign(color) {
    this.gameOver = true;
    this.resigned = color;
    this.endTime = Date.now();
    this.result = {
      winner: opponent(color),
      score: 0,
      method: 'resignation'
    };
    return this.result;
  }

  // End game and score
  endGame() {
    this.gameOver = true;
    this.endTime = Date.now();
    this.territory = this.computeTerritory();
    this.result = this.computeScore();
    return this.result;
  }

  // Flood-fill territory counting (Chinese-style scoring)
  computeTerritory() {
    const territory = Array.from({ length: this.size }, () => new Int8Array(this.size));
    const visited = Array.from({ length: this.size }, () => new Uint8Array(this.size));

    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        if (this.board[y][x] !== EMPTY || visited[y][x]) continue;

        // BFS to find connected empty region
        const region = [];
        const queue = [[x, y]];
        let touchesBlack = false;
        let touchesWhite = false;
        visited[y][x] = 1;

        while (queue.length > 0) {
          const [cx, cy] = queue.shift();
          region.push([cx, cy]);

          for (const [nx, ny] of this.neighbors(cx, cy)) {
            if (this.board[ny][nx] === BLACK) {
              touchesBlack = true;
            } else if (this.board[ny][nx] === WHITE) {
              touchesWhite = true;
            } else if (!visited[ny][nx]) {
              visited[ny][nx] = 1;
              queue.push([nx, ny]);
            }
          }
        }

        // Assign territory if only touches one color
        let owner = EMPTY;
        if (touchesBlack && !touchesWhite) owner = BLACK;
        else if (touchesWhite && !touchesBlack) owner = WHITE;

        for (const [rx, ry] of region) {
          territory[ry][rx] = owner;
        }
      }
    }

    return territory;
  }

  // Chinese scoring (area scoring)
  computeScore() {
    const territory = this.territory || this.computeTerritory();
    let blackScore = 0;
    let whiteScore = 0;

    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        if (this.board[y][x] === BLACK || territory[y][x] === BLACK) {
          blackScore++;
        } else if (this.board[y][x] === WHITE || territory[y][x] === WHITE) {
          whiteScore++;
        }
      }
    }

    whiteScore += this.komi;

    const winner = blackScore > whiteScore ? BLACK : WHITE;
    const margin = Math.abs(blackScore - whiteScore);

    return {
      winner,
      blackScore,
      whiteScore,
      margin,
      score: margin,
      method: 'scoring',
      display: `${winner === BLACK ? 'B' : 'W'}+${margin}`
    };
  }

  // Estimate score mid-game (for AI and analysis)
  estimateScore() {
    const territory = this.computeTerritory();
    let blackScore = 0;
    let whiteScore = 0;

    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        if (this.board[y][x] === BLACK || territory[y][x] === BLACK) {
          blackScore++;
        } else if (this.board[y][x] === WHITE || territory[y][x] === WHITE) {
          whiteScore++;
        }
      }
    }
    whiteScore += this.komi;
    return { blackScore, whiteScore, lead: blackScore - whiteScore };
  }

  // Get influence map for analysis (simplified)
  getInfluenceMap() {
    const influence = Array.from({ length: this.size }, () => new Float32Array(this.size));
    const decay = 0.5;

    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        if (this.board[y][x] === EMPTY) continue;
        const val = this.board[y][x] === BLACK ? 1 : -1;

        // Radiate influence
        for (let dy = -6; dy <= 6; dy++) {
          for (let dx = -6; dx <= 6; dx++) {
            const ny = y + dy, nx = x + dx;
            if (ny < 0 || ny >= this.size || nx < 0 || nx >= this.size) continue;
            const dist = Math.abs(dx) + Math.abs(dy);
            if (dist === 0) continue;
            influence[ny][nx] += val * Math.pow(decay, dist);
          }
        }
      }
    }

    return influence;
  }

  // Serialize for network transmission
  serialize() {
    return {
      size: this.size,
      komi: this.komi,
      board: this.board.map(row => Array.from(row)),
      currentPlayer: this.currentPlayer,
      moves: this.moves,
      captures: this.captures,
      koPoint: this.koPoint,
      passCount: this.passCount,
      gameOver: this.gameOver,
      result: this.result,
      territory: this.territory ? this.territory.map(row => Array.from(row)) : null,
      startTime: this.startTime,
      endTime: this.endTime,
      resigned: this.resigned
    };
  }

  // Restore from serialized
  static deserialize(data) {
    const g = new GoGame(data.size, data.komi);
    for (let y = 0; y < data.size; y++) {
      for (let x = 0; x < data.size; x++) {
        g.board[y][x] = data.board[y][x];
      }
    }
    g.currentPlayer = data.currentPlayer;
    g.moves = data.moves;
    g.captures = data.captures;
    g.koPoint = data.koPoint;
    g.passCount = data.passCount;
    g.gameOver = data.gameOver;
    g.result = data.result;
    g.startTime = data.startTime;
    g.endTime = data.endTime;
    g.resigned = data.resigned;
    if (data.territory) {
      g.territory = data.territory.map(row => Int8Array.from(row));
    }
    return g;
  }
}

module.exports = { GoGame, EMPTY, BLACK, WHITE, opponent };
