// ============================================================
// MAP.JS - Terrain generation, tile system, resource nodes
// ============================================================

class GameMap {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.tiles = new Array(w * h).fill(T.GRASS);
    this.resources = {}; // key: "x,y" -> { type, amount }
    this.occupancy = new Array(w * h).fill(0); // 0=free, entityId=occupied
    this.seed = Math.random() * 10000;
  }

  get(x, y) { return (x >= 0 && x < this.w && y >= 0 && y < this.h) ? this.tiles[y * this.w + x] : T.WATER; }
  set(x, y, t) { if (x >= 0 && x < this.w && y >= 0 && y < this.h) this.tiles[y * this.w + x] = t; }

  isWalkable(x, y, unitType) {
    if (x < 0 || x >= this.w || y < 0 || y >= this.h) return false;
    const t = this.get(x, y);
    if (unitType === 'air') return true;
    if (unitType === 'naval') return t === T.WATER || t === T.OIL || t === T.COAST;
    // ground
    return t !== T.WATER && t !== T.OIL && this.occupancy[y * this.w + x] === 0;
  }

  isWalkableTerrain(x, y, unitType) {
    if (x < 0 || x >= this.w || y < 0 || y >= this.h) return false;
    const t = this.get(x, y);
    if (unitType === 'air') return true;
    if (unitType === 'naval') return t === T.WATER || t === T.OIL || t === T.COAST;
    return t !== T.WATER && t !== T.OIL;
  }

  occupy(x, y, id) { if (x >= 0 && x < this.w && y >= 0 && y < this.h) this.occupancy[y * this.w + x] = id; }
  unoccupy(x, y) { if (x >= 0 && x < this.w && y >= 0 && y < this.h) this.occupancy[y * this.w + x] = 0; }
  getOccupant(x, y) { return (x >= 0 && x < this.w && y >= 0 && y < this.h) ? this.occupancy[y * this.w + x] : -1; }

  canPlaceBuilding(bx, by, size, ignoreId) {
    for (let dy = 0; dy < size; dy++) {
      for (let dx = 0; dx < size; dx++) {
        const x = bx + dx, y = by + dy;
        if (x < 0 || x >= this.w || y < 0 || y >= this.h) return false;
        const t = this.get(x, y);
        if (t === T.WATER || t === T.OIL || t === T.GOLD) return false;
        const occ = this.occupancy[y * this.w + x];
        if (occ !== 0 && occ !== ignoreId) return false;
      }
    }
    return true;
  }

  placeBuilding(bx, by, size, id) {
    for (let dy = 0; dy < size; dy++)
      for (let dx = 0; dx < size; dx++)
        this.occupy(bx + dx, by + dy, id);
  }

  removeBuilding(bx, by, size) {
    for (let dy = 0; dy < size; dy++)
      for (let dx = 0; dx < size; dx++)
        this.unoccupy(bx + dx, by + dy);
  }

  addResource(x, y, type, amount) {
    this.resources[`${x},${y}`] = { type, amount, x, y };
  }

  getResource(x, y) { return this.resources[`${x},${y}`] || null; }

  harvestResource(x, y, amount) {
    const key = `${x},${y}`;
    const r = this.resources[key];
    if (!r) return 0;
    const taken = Math.min(r.amount, amount);
    r.amount -= taken;
    if (r.amount <= 0) {
      delete this.resources[key];
      if (r.type === 'gold') this.set(x, y, T.DIRT);
      else if (r.type === 'lumber') {
        this.set(x, y, T.GRASS);
        // Also clear forest tiles around depleted tree
      }
    }
    return taken;
  }

  generate() {
    const s = this.seed;
    // Base terrain with noise
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const n = fbmNoise(x, y, s, 4, 12);
        const waterNoise = fbmNoise(x, y, s + 500, 3, 16);

        if (waterNoise < 0.28) {
          this.set(x, y, T.WATER);
        } else if (waterNoise < 0.32) {
          this.set(x, y, T.COAST);
        } else if (n > 0.6 && waterNoise > 0.4) {
          this.set(x, y, T.FOREST);
          this.addResource(x, y, 'lumber', randInt(50, 150));
        } else {
          this.set(x, y, T.GRASS);
        }
      }
    }

    // Clear starting areas (bottom-left for P1, top-right for P2)
    this._clearArea(3, this.h - 12, 14, 14);
    this._clearArea(this.w - 17, 3, 14, 14);

    // Place gold mines near starting positions
    this._placeGoldMine(8, this.h - 7, 10000);
    this._placeGoldMine(14, this.h - 10, 10000);
    this._placeGoldMine(this.w - 10, 7, 10000);
    this._placeGoldMine(this.w - 16, 10, 10000);

    // Place random gold mines around the map
    for (let i = 0; i < 8; i++) {
      const gx = randInt(10, this.w - 10);
      const gy = randInt(10, this.h - 10);
      if (this.get(gx, gy) === T.GRASS) this._placeGoldMine(gx, gy, randInt(5000, 15000));
    }

    // Place oil patches on water
    let oilCount = 0;
    for (let attempt = 0; attempt < 100 && oilCount < 6; attempt++) {
      const ox = randInt(5, this.w - 5);
      const oy = randInt(5, this.h - 5);
      if (this.get(ox, oy) === T.WATER) {
        this.set(ox, oy, T.OIL);
        this.addResource(ox, oy, 'oil', randInt(20000, 50000));
        oilCount++;
      }
    }

    // Ensure forests near starting positions
    this._ensureForests(5, this.h - 14, 10);
    this._ensureForests(this.w - 15, 5, 10);
  }

  _clearArea(sx, sy, w, h) {
    for (let y = sy; y < sy + h && y < this.h; y++)
      for (let x = sx; x < sx + w && x < this.w; x++) {
        if (x >= 0 && y >= 0) {
          this.set(x, y, T.GRASS);
          const key = `${x},${y}`;
          if (this.resources[key] && this.resources[key].type === 'lumber') delete this.resources[key];
        }
      }
  }

  _placeGoldMine(cx, cy, amount) {
    // Gold mine is 2x2
    for (let dy = 0; dy < 2; dy++)
      for (let dx = 0; dx < 2; dx++) {
        this.set(cx + dx, cy + dy, T.GOLD);
        this.addResource(cx + dx, cy + dy, 'gold', Math.floor(amount / 4));
      }
  }

  _ensureForests(sx, sy, count) {
    let placed = 0;
    for (let attempt = 0; attempt < 100 && placed < count; attempt++) {
      const fx = sx + randInt(-3, 12);
      const fy = sy + randInt(-3, 12);
      if (fx >= 0 && fy >= 0 && fx < this.w && fy < this.h && this.get(fx, fy) === T.GRASS) {
        this.set(fx, fy, T.FOREST);
        this.addResource(fx, fy, 'lumber', randInt(50, 150));
        placed++;
      }
    }
  }

  // Find nearest resource tile of type near position
  findNearestResource(tx, ty, type, maxDist = 20) {
    let best = null, bestD = Infinity;
    for (const key in this.resources) {
      const r = this.resources[key];
      if (r.type !== type || r.amount <= 0) continue;
      const d = dist(tx, ty, r.x, r.y);
      if (d < bestD && d <= maxDist) { bestD = d; best = r; }
    }
    return best;
  }

  // Find free tile adjacent to position
  findFreeTileNear(tx, ty, unitType, maxDist = 5) {
    for (let r = 1; r <= maxDist; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
          const nx = tx + dx, ny = ty + dy;
          if (this.isWalkable(nx, ny, unitType)) return { x: nx, y: ny };
        }
      }
    }
    return null;
  }
}
