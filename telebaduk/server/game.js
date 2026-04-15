const EMPTY = 0, BLACK = 1, WHITE = 2;

class GoGame {
  constructor(size = 19, komi = 6.5) {
    this.size = size;
    this.komi = komi;
    this.board = Array.from({ length: size }, () => new Int8Array(size));
    this.currentPlayer = BLACK;
    this.moves = [];
    this.captures = { [BLACK]: 0, [WHITE]: 0 };
    this.koPoint = null;
    this.consecutivePasses = 0;
    this.gameOver = false;
    this.winner = null;
    this.result = null;
    this.boardHistory = [];
    this.pendingRedo = null; // { requestedBy, moveIndex }
  }

  opponent(color) {
    return color === BLACK ? WHITE : BLACK;
  }

  inBounds(x, y) {
    return x >= 0 && x < this.size && y >= 0 && y < this.size;
  }

  neighbors(x, y) {
    const n = [];
    if (x > 0) n.push([x - 1, y]);
    if (x < this.size - 1) n.push([x + 1, y]);
    if (y > 0) n.push([x, y - 1]);
    if (y < this.size - 1) n.push([x, y + 1]);
    return n;
  }

  getGroup(x, y) {
    const color = this.board[y][x];
    if (color === EMPTY) return { stones: [], liberties: 0, libertySet: new Set() };
    const visited = new Set();
    const stones = [];
    const libertySet = new Set();
    const stack = [[x, y]];
    while (stack.length > 0) {
      const [cx, cy] = stack.pop();
      const key = cy * this.size + cx;
      if (visited.has(key)) continue;
      visited.add(key);
      stones.push([cx, cy]);
      for (const [nx, ny] of this.neighbors(cx, cy)) {
        const nk = ny * this.size + nx;
        if (this.board[ny][nx] === EMPTY) {
          libertySet.add(nk);
        } else if (this.board[ny][nx] === color && !visited.has(nk)) {
          stack.push([nx, ny]);
        }
      }
    }
    return { stones, liberties: libertySet.size, libertySet };
  }

  // Returns groups of given color that are in atari (1 liberty)
  getAtariGroups(color) {
    const visited = new Set();
    const groups = [];
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        if (this.board[y][x] !== color) continue;
        const key = y * this.size + x;
        if (visited.has(key)) continue;
        const group = this.getGroup(x, y);
        for (const [sx, sy] of group.stones) visited.add(sy * this.size + sx);
        if (group.liberties === 1) groups.push(group);
      }
    }
    return groups;
  }

  boardHash() {
    let hash = '';
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        hash += this.board[y][x];
      }
    }
    return hash;
  }

  saveBoardState() {
    return this.board.map(row => new Int8Array(row));
  }

  isLegalMove(x, y, color) {
    if (!this.inBounds(x, y) || this.board[y][x] !== EMPTY) return false;
    if (this.gameOver) return false;
    if (color !== this.currentPlayer) return false;
    if (this.koPoint && this.koPoint[0] === x && this.koPoint[1] === y) return false;

    // Temporarily place stone
    this.board[y][x] = color;
    const opp = this.opponent(color);
    let wouldCapture = false;

    // Check if any opponent neighbor groups would be captured
    for (const [nx, ny] of this.neighbors(x, y)) {
      if (this.board[ny][nx] === opp) {
        const g = this.getGroup(nx, ny);
        if (g.liberties === 0) { wouldCapture = true; break; }
      }
    }

    // Check if own group has liberties (suicide check)
    if (!wouldCapture) {
      const own = this.getGroup(x, y);
      if (own.liberties === 0) {
        this.board[y][x] = EMPTY;
        return false; // suicide
      }
    }

    this.board[y][x] = EMPTY;
    return true;
  }

  playMove(x, y, color) {
    if (!this.isLegalMove(x, y, color)) return null;

    const prevBoard = this.saveBoardState();
    this.board[y][x] = color;
    const opp = this.opponent(color);
    let captured = [];

    // Capture opponent groups with 0 liberties
    for (const [nx, ny] of this.neighbors(x, y)) {
      if (this.board[ny][nx] === opp) {
        const g = this.getGroup(nx, ny);
        if (g.liberties === 0) {
          for (const [sx, sy] of g.stones) {
            this.board[sy][sx] = EMPTY;
            captured.push([sx, sy]);
          }
        }
      }
    }

    this.captures[color] += captured.length;

    // Ko detection: single stone capture with single stone
    if (captured.length === 1) {
      const ownGroup = this.getGroup(x, y);
      if (ownGroup.stones.length === 1 && ownGroup.liberties === 1) {
        this.koPoint = [captured[0][0], captured[0][1]];
      } else {
        this.koPoint = null;
      }
    } else {
      this.koPoint = null;
    }

    this.consecutivePasses = 0;
    this.pendingRedo = null;

    const moveData = {
      x, y, color, captured, moveNumber: this.moves.length + 1,
      timestamp: Date.now(), prevBoard
    };
    this.moves.push(moveData);
    this.boardHistory.push(this.boardHash());
    this.currentPlayer = opp;

    // Find atari groups after this move
    const atariGroups = [
      ...this.getAtariGroups(BLACK),
      ...this.getAtariGroups(WHITE)
    ];

    return { ...moveData, atariGroups };
  }

  pass(color) {
    if (this.gameOver || color !== this.currentPlayer) return null;
    this.consecutivePasses++;
    this.pendingRedo = null;
    const moveData = {
      pass: true, color, moveNumber: this.moves.length + 1,
      timestamp: Date.now()
    };
    this.moves.push(moveData);
    this.currentPlayer = this.opponent(color);

    if (this.consecutivePasses >= 2) {
      this.endGame();
    }
    return moveData;
  }

  resign(color) {
    if (this.gameOver) return null;
    this.gameOver = true;
    this.winner = this.opponent(color);
    this.result = {
      winner: this.winner,
      reason: 'resignation',
      display: `${this.winner === BLACK ? 'Black' : 'White'} wins by resignation`
    };
    return this.result;
  }

  // Undo the last move (for redo system)
  undoLastMove() {
    if (this.moves.length === 0 || this.gameOver) return null;
    const lastMove = this.moves[this.moves.length - 1];
    if (lastMove.pass) {
      this.moves.pop();
      this.consecutivePasses = Math.max(0, this.consecutivePasses - 1);
      this.currentPlayer = lastMove.color;
      return lastMove;
    }

    // Restore board from prevBoard
    if (lastMove.prevBoard) {
      for (let y = 0; y < this.size; y++) {
        this.board[y] = new Int8Array(lastMove.prevBoard[y]);
      }
    }
    this.captures[lastMove.color] -= lastMove.captured.length;
    this.moves.pop();
    this.boardHistory.pop();
    this.currentPlayer = lastMove.color;
    this.koPoint = null;
    this.pendingRedo = null;
    return lastMove;
  }

  // Request redo - returns true if valid
  requestRedo(requestingColor) {
    if (this.moves.length === 0 || this.gameOver) return false;
    const lastMove = this.moves[this.moves.length - 1];
    // Can only redo if it was your move and opponent hasn't moved yet
    if (lastMove.color !== requestingColor) return false;
    this.pendingRedo = { requestedBy: requestingColor, moveIndex: this.moves.length - 1 };
    return true;
  }

  // Accept redo from opponent
  acceptRedo(acceptingColor) {
    if (!this.pendingRedo) return null;
    if (this.pendingRedo.requestedBy === acceptingColor) return null; // can't accept own
    const undone = this.undoLastMove();
    this.pendingRedo = null;
    return undone;
  }

  // Reject redo
  rejectRedo(rejectingColor) {
    if (!this.pendingRedo) return false;
    if (this.pendingRedo.requestedBy === rejectingColor) return false;
    this.pendingRedo = null;
    return true;
  }

  getLegalMoves(color) {
    const moves = [];
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        if (this.isLegalMove(x, y, color)) moves.push([x, y]);
      }
    }
    return moves;
  }

  // Simplified influence estimation using radial distance
  getInfluenceMap() {
    const inf = Array.from({ length: this.size }, () => new Float32Array(this.size));
    const radius = Math.max(4, Math.floor(this.size / 3));

    for (let sy = 0; sy < this.size; sy++) {
      for (let sx = 0; sx < this.size; sx++) {
        const stone = this.board[sy][sx];
        if (stone === EMPTY) continue;
        const sign = stone === BLACK ? 1 : -1;

        for (let dy = -radius; dy <= radius; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
            const ty = sy + dy, tx = sx + dx;
            if (!this.inBounds(tx, ty)) continue;
            const dist = Math.abs(dx) + Math.abs(dy); // Manhattan
            if (dist === 0) {
              inf[ty][tx] += sign * 100;
            } else if (dist <= radius) {
              inf[ty][tx] += sign * (1.0 / (dist * dist));
            }
          }
        }
      }
    }
    return inf;
  }

  // Estimate territory from influence map
  estimateTerritory() {
    const inf = this.getInfluenceMap();
    let black = 0, white = 0;
    const territory = Array.from({ length: this.size }, () => new Int8Array(this.size));

    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        if (this.board[y][x] !== EMPTY) {
          territory[y][x] = this.board[y][x];
          if (this.board[y][x] === BLACK) black++;
          else white++;
        } else if (inf[y][x] > 0.3) {
          territory[y][x] = BLACK;
          black++;
        } else if (inf[y][x] < -0.3) {
          territory[y][x] = WHITE;
          white++;
        }
      }
    }
    return {
      blackTerritory: black,
      whiteTerritory: white + this.komi,
      territory,
      influence: inf
    };
  }

  // Final scoring with dead stone detection (Chinese rules - area scoring)
  // deadStones is an array of [x, y] manually marked dead
  finalScore(deadStones = []) {
    // Clone board for scoring
    const scoringBoard = this.board.map(row => new Int8Array(row));

    // Remove dead stones
    const deadSet = new Set(deadStones.map(([x, y]) => y * this.size + x));
    for (const [x, y] of deadStones) {
      scoringBoard[y][x] = EMPTY;
    }

    // Flood fill to find territories
    const territory = Array.from({ length: this.size }, () => new Int8Array(this.size));
    // 0 = neutral, 1 = black territory, 2 = white territory, 3 = dame
    const visited = new Set();

    const floodEmpty = (startX, startY) => {
      const region = [];
      let touchesBlack = false, touchesWhite = false;
      const stack = [[startX, startY]];
      const regionVisited = new Set();

      while (stack.length > 0) {
        const [cx, cy] = stack.pop();
        const key = cy * this.size + cx;
        if (regionVisited.has(key)) continue;
        regionVisited.add(key);

        if (scoringBoard[cy][cx] === BLACK) { touchesBlack = true; continue; }
        if (scoringBoard[cy][cx] === WHITE) { touchesWhite = true; continue; }

        region.push([cx, cy]);
        visited.add(key);

        for (const [nx, ny] of this.neighbors(cx, cy)) {
          if (!regionVisited.has(ny * this.size + nx)) {
            stack.push([nx, ny]);
          }
        }
      }

      let owner = EMPTY;
      if (touchesBlack && !touchesWhite) owner = BLACK;
      else if (touchesWhite && !touchesBlack) owner = WHITE;
      // else dame

      for (const [rx, ry] of region) {
        territory[ry][rx] = owner;
      }
      return { region, owner };
    };

    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        const key = y * this.size + x;
        if (scoringBoard[y][x] === EMPTY && !visited.has(key)) {
          floodEmpty(x, y);
        }
      }
    }

    // Count scores (Chinese scoring: stones + territory)
    let blackScore = 0, whiteScore = 0;
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        if (scoringBoard[y][x] === BLACK) blackScore++;
        else if (scoringBoard[y][x] === WHITE) whiteScore++;
        if (territory[y][x] === BLACK) blackScore++;
        else if (territory[y][x] === WHITE) whiteScore++;
      }
    }

    whiteScore += this.komi;

    const winner = blackScore > whiteScore ? BLACK : WHITE;
    const margin = Math.abs(blackScore - whiteScore);

    return {
      blackScore,
      whiteScore,
      winner,
      margin,
      territory,
      deadStones,
      display: `${winner === BLACK ? 'Black' : 'White'} wins by ${margin} points`
    };
  }

  endGame(deadStones = []) {
    this.gameOver = true;
    this.result = this.finalScore(deadStones);
    this.winner = this.result.winner;
    return this.result;
  }

  serialize() {
    const board = [];
    for (let y = 0; y < this.size; y++) {
      board.push(Array.from(this.board[y]));
    }
    return {
      size: this.size,
      komi: this.komi,
      board,
      currentPlayer: this.currentPlayer,
      moves: this.moves.map(m => ({
        x: m.x, y: m.y, color: m.color, pass: m.pass,
        captured: m.captured, moveNumber: m.moveNumber
      })),
      captures: this.captures,
      koPoint: this.koPoint,
      consecutivePasses: this.consecutivePasses,
      gameOver: this.gameOver,
      winner: this.winner,
      result: this.result,
      pendingRedo: this.pendingRedo,
      moveCount: this.moves.length
    };
  }

  static deserialize(data) {
    const game = new GoGame(data.size, data.komi);
    for (let y = 0; y < data.size; y++) {
      game.board[y] = new Int8Array(data.board[y]);
    }
    game.currentPlayer = data.currentPlayer;
    game.captures = data.captures;
    game.koPoint = data.koPoint;
    game.consecutivePasses = data.consecutivePasses;
    game.gameOver = data.gameOver;
    game.winner = data.winner;
    game.result = data.result;
    game.pendingRedo = data.pendingRedo;
    return game;
  }

  clone() {
    const g = new GoGame(this.size, this.komi);
    for (let y = 0; y < this.size; y++) {
      g.board[y] = new Int8Array(this.board[y]);
    }
    g.currentPlayer = this.currentPlayer;
    g.captures = { ...this.captures };
    g.koPoint = this.koPoint ? [...this.koPoint] : null;
    g.consecutivePasses = this.consecutivePasses;
    g.gameOver = this.gameOver;
    g.winner = this.winner;
    return g;
  }
}

module.exports = { GoGame, EMPTY, BLACK, WHITE };
