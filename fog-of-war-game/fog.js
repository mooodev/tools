// ============================================================
// FOG.JS - Fog of War system
// ============================================================
// States: 0 = unexplored (black), 1 = explored (dark), 2 = visible (clear)

class FogOfWar {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    // Each player gets their own fog grid
    this.grids = {}; // playerId -> Uint8Array
  }

  initPlayer(playerId) {
    this.grids[playerId] = new Uint8Array(this.w * this.h); // all 0 = unexplored
  }

  getVisibility(playerId, x, y) {
    const g = this.grids[playerId];
    if (!g || x < 0 || x >= this.w || y < 0 || y >= this.h) return 0;
    return g[y * this.w + x];
  }

  // Reset visible to explored each frame, then re-reveal
  resetVisible(playerId) {
    const g = this.grids[playerId];
    if (!g) return;
    for (let i = 0; i < g.length; i++) {
      if (g[i] === 2) g[i] = 1;
    }
  }

  // Reveal area around a point with given sight radius
  reveal(playerId, cx, cy, radius) {
    const g = this.grids[playerId];
    if (!g) return;
    const r2 = (radius + 0.5) * (radius + 0.5);
    const minX = Math.max(0, Math.floor(cx - radius));
    const maxX = Math.min(this.w - 1, Math.ceil(cx + radius));
    const minY = Math.max(0, Math.floor(cy - radius));
    const maxY = Math.min(this.h - 1, Math.ceil(cy + radius));
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const dx = x - cx, dy = y - cy;
        if (dx * dx + dy * dy <= r2) {
          g[y * this.w + x] = 2;
        }
      }
    }
  }

  isVisible(playerId, x, y) { return this.getVisibility(playerId, x, y) === 2; }
  isExplored(playerId, x, y) { return this.getVisibility(playerId, x, y) >= 1; }
}
