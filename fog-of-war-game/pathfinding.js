// ============================================================
// PATHFINDING.JS - A* algorithm
// ============================================================

class PathFinder {
  constructor(gameMap) {
    this.map = gameMap;
  }

  findPath(sx, sy, ex, ey, unitType, maxNodes = 800) {
    // Clamp end to walkable
    if (!this.map.isWalkableTerrain(ex, ey, unitType)) {
      const near = this.map.findFreeTileNear(ex, ey, unitType, 3);
      if (near) { ex = near.x; ey = near.y; }
      else return [];
    }

    if (sx === ex && sy === ey) return [];

    const w = this.map.w;
    const key = (x, y) => y * w + x;
    const open = new PriorityQueue();
    const cameFrom = new Map();
    const gScore = new Map();
    const start = key(sx, sy);
    const end = key(ex, ey);

    gScore.set(start, 0);
    open.push(start, this._heuristic(sx, sy, ex, ey));
    cameFrom.set(start, null);

    let nodesChecked = 0;
    const dirs = [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]];

    while (open.size > 0 && nodesChecked < maxNodes) {
      const current = open.pop();
      nodesChecked++;

      if (current === end) {
        return this._reconstruct(cameFrom, current, w);
      }

      const cx = current % w, cy = Math.floor(current / w);

      for (const [dx, dy] of dirs) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || nx >= this.map.w || ny < 0 || ny >= this.map.h) continue;

        // Check walkability (ignore occupancy for final tile)
        const nk = key(nx, ny);
        if (nk !== end) {
          if (!this.map.isWalkable(nx, ny, unitType)) continue;
        } else {
          if (!this.map.isWalkableTerrain(nx, ny, unitType)) continue;
        }

        // Diagonal movement: check that both cardinal neighbors are walkable
        if (dx !== 0 && dy !== 0) {
          if (!this.map.isWalkableTerrain(cx + dx, cy, unitType) ||
              !this.map.isWalkableTerrain(cx, cy + dy, unitType)) continue;
        }

        const moveCost = (dx !== 0 && dy !== 0) ? 1.414 : 1.0;
        const tentG = gScore.get(current) + moveCost;

        if (!gScore.has(nk) || tentG < gScore.get(nk)) {
          gScore.set(nk, tentG);
          cameFrom.set(nk, current);
          const f = tentG + this._heuristic(nx, ny, ex, ey);
          open.push(nk, f);
        }
      }
    }

    // No path found - return partial path to closest visited node
    let bestKey = start, bestDist = Infinity;
    for (const [k] of gScore) {
      const kx = k % w, ky = Math.floor(k / w);
      const d = this._heuristic(kx, ky, ex, ey);
      if (d < bestDist) { bestDist = d; bestKey = k; }
    }
    return this._reconstruct(cameFrom, bestKey, w);
  }

  _heuristic(x1, y1, x2, y2) {
    // Chebyshev distance
    return Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));
  }

  _reconstruct(cameFrom, current, w) {
    const path = [];
    while (current !== null && cameFrom.has(current)) {
      path.push({ x: current % w, y: Math.floor(current / w) });
      current = cameFrom.get(current);
    }
    path.reverse();
    // Remove first element (current position)
    if (path.length > 0) path.shift();
    return path;
  }
}
