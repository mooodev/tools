// ============================================================
// RENDERER.JS - Canvas drawing, minimap
// ============================================================

class Renderer {
  constructor(game) {
    this.game = game;
    this.canvas = document.getElementById('gameCanvas');
    this.ctx = this.canvas.getContext('2d');
    this.miniCanvas = document.getElementById('minimap');
    this.miniCtx = this.miniCanvas.getContext('2d');
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = window.innerWidth * dpr;
    this.canvas.height = window.innerHeight * dpr;
    this.canvas.style.width = window.innerWidth + 'px';
    this.canvas.style.height = window.innerHeight + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.game.camera.setSize(window.innerWidth, window.innerHeight);
    // Minimap size
    const mSize = Math.min(120, window.innerWidth * 0.25);
    this.miniCanvas.width = mSize;
    this.miniCanvas.height = mSize;
    document.getElementById('minimapContainer').style.width = mSize + 'px';
  }

  render() {
    const ctx = this.ctx;
    const cam = this.game.camera;
    const fog = this.game.fog;
    const map = this.game.map;
    const pid = this.game.humanPlayerId;
    const w = window.innerWidth, h = window.innerHeight;

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.scale(cam.zoom, cam.zoom);
    ctx.translate(-cam.x, -cam.y);

    // Visible tile range
    const startTX = Math.max(0, Math.floor(cam.x / TILE) - 1);
    const startTY = Math.max(0, Math.floor(cam.y / TILE) - 1);
    const endTX = Math.min(MAP_W, Math.ceil((cam.x + cam.viewW) / TILE) + 1);
    const endTY = Math.min(MAP_H, Math.ceil((cam.y + cam.viewH) / TILE) + 1);

    // Draw terrain
    for (let ty = startTY; ty < endTY; ty++) {
      for (let tx = startTX; tx < endTX; tx++) {
        const vis = fog.getVisibility(pid, tx, ty);
        if (vis === 0) continue; // unexplored = black (already filled)

        const tile = map.get(tx, ty);
        ctx.fillStyle = TERRAIN_COLORS[tile] || '#333';
        ctx.fillRect(tx * TILE, ty * TILE, TILE, TILE);

        // Resource indicators
        const res = map.getResource(tx, ty);
        if (res) {
          if (res.type === 'gold') {
            ctx.fillStyle = '#FFD700';
            ctx.fillRect(tx * TILE + 4, ty * TILE + 4, TILE - 8, TILE - 8);
            // Shine effect
            ctx.fillStyle = 'rgba(255,255,200,0.3)';
            ctx.fillRect(tx * TILE + 8, ty * TILE + 6, 6, 4);
          } else if (res.type === 'lumber') {
            // Tree
            ctx.fillStyle = '#0a3a0a';
            ctx.beginPath();
            ctx.arc(tx * TILE + TILE / 2, ty * TILE + TILE / 2, TILE / 3, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#5a3a1a';
            ctx.fillRect(tx * TILE + 13, ty * TILE + 20, 6, 10);
          } else if (res.type === 'oil') {
            ctx.fillStyle = '#111';
            ctx.beginPath();
            ctx.arc(tx * TILE + TILE / 2, ty * TILE + TILE / 2, TILE / 3, 0, Math.PI * 2);
            ctx.fill();
          }
        }

        // Fog dimming for explored-but-not-visible
        if (vis === 1) {
          ctx.fillStyle = 'rgba(0,0,0,0.55)';
          ctx.fillRect(tx * TILE, ty * TILE, TILE, TILE);
        }
      }
    }

    // Grid lines (subtle)
    ctx.strokeStyle = 'rgba(0,0,0,0.1)';
    ctx.lineWidth = 0.5;
    for (let ty = startTY; ty <= endTY; ty++) {
      ctx.beginPath(); ctx.moveTo(startTX * TILE, ty * TILE); ctx.lineTo(endTX * TILE, ty * TILE); ctx.stroke();
    }
    for (let tx = startTX; tx <= endTX; tx++) {
      ctx.beginPath(); ctx.moveTo(tx * TILE, startTY * TILE); ctx.lineTo(tx * TILE, endTY * TILE); ctx.stroke();
    }

    // Draw buildings
    for (const e of this.game.entities) {
      if (!e.alive || !(e instanceof Building)) continue;
      const bx = e.tx, by = e.ty;

      // Check visibility
      let visible = false;
      for (let dy = 0; dy < e.size; dy++)
        for (let dx = 0; dx < e.size; dx++)
          if (fog.isVisible(pid, bx + dx, by + dy)) visible = true;

      // Show explored buildings (last known position)
      let explored = false;
      if (!visible) {
        for (let dy = 0; dy < e.size; dy++)
          for (let dx = 0; dx < e.size; dx++)
            if (fog.isExplored(pid, bx + dx, by + dy)) explored = true;
      }

      if (!visible && !explored) continue;
      if (!visible && explored && e.playerId !== pid) {
        // Draw ghost building (last known)
        this.drawBuilding(ctx, e, true);
        continue;
      }

      this.drawBuilding(ctx, e, false);
    }

    // Draw units (visible only)
    for (const e of this.game.entities) {
      if (!e.alive || !(e instanceof Unit)) continue;
      if (e.moveType !== 'air' && !fog.isVisible(pid, e.tx, e.ty)) {
        if (e.playerId === pid) {
          // Always show own units
        } else {
          // Check for stealth
          if (e.isStealthy) continue;
          continue;
        }
      }
      if (e.hasBuff('invisible') && e.playerId !== pid) continue;
      this.drawUnit(ctx, e);
    }

    // Draw placement preview
    if (this.game.input && this.game.input.placementMode) {
      this.drawPlacementPreview(ctx);
    }

    // Draw effects
    this.drawEffects(ctx);

    // Draw selection indicator
    for (const e of this.game.entities) {
      if (!e.alive || !e.selected) continue;
      this.drawSelection(ctx, e);
    }

    ctx.restore();

    // Draw minimap
    this.drawMinimap();
  }

  drawBuilding(ctx, b, ghost) {
    const px = b.tx * TILE, py = b.ty * TILE;
    const size = b.size * TILE;
    const player = this.game.getPlayer(b.playerId);

    // Building body
    const baseColor = BUILDING_COLORS[b.buildingType] || '#666';
    ctx.fillStyle = ghost ? 'rgba(100,100,100,0.5)' : baseColor;
    ctx.fillRect(px + 1, py + 1, size - 2, size - 2);

    // Player color border
    ctx.strokeStyle = ghost ? 'rgba(150,150,150,0.4)' : player.color;
    ctx.lineWidth = 2;
    ctx.strokeRect(px + 1, py + 1, size - 2, size - 2);

    // Construction progress
    if (!b.constructed) {
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(px + 1, py + 1, size - 2, (size - 2) * (1 - b.constructionProgress));
      // Progress bar
      ctx.fillStyle = '#0f0';
      ctx.fillRect(px + 2, py + size - 6, (size - 4) * b.constructionProgress, 4);
    }

    // HP bar (if damaged)
    if (b.constructed && b.hp < b.maxHp && !ghost) {
      const hpPct = b.hp / b.maxHp;
      ctx.fillStyle = '#333';
      ctx.fillRect(px + 2, py - 6, size - 4, 4);
      ctx.fillStyle = hpPct > 0.5 ? '#0f0' : hpPct > 0.25 ? '#ff0' : '#f00';
      ctx.fillRect(px + 2, py - 6, (size - 4) * hpPct, 4);
    }

    // Training progress
    if (b.trainTimer && !ghost) {
      ctx.fillStyle = '#00f';
      ctx.fillRect(px + 2, py + size - 4, (size - 4) * b.trainTimer.progress, 3);
    }

    // Upgrade indicator
    if (b.upgrading && !ghost) {
      ctx.fillStyle = '#ff0';
      ctx.fillRect(px + 2, py + size - 8, (size - 4) * b.upgradeTimer.progress, 3);
    }

    // Building type indicator (letter)
    if (!ghost) {
      ctx.fillStyle = '#fff';
      ctx.font = `${Math.max(10, b.size * 5)}px monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const label = b.displayName.charAt(0);
      ctx.fillText(label, px + size / 2, py + size / 2);
    }
  }

  drawUnit(ctx, u) {
    const x = u.px, y = u.py;
    const r = TILE * 0.35;
    const player = this.game.getPlayer(u.playerId);

    // Unit body
    ctx.beginPath();
    if (u.moveType === 'air') {
      // Diamond shape for air units
      ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y);
      ctx.closePath();
    } else if (u.moveType === 'naval') {
      // Boat shape
      ctx.moveTo(x - r, y); ctx.lineTo(x - r * 0.5, y - r); ctx.lineTo(x + r * 0.5, y - r);
      ctx.lineTo(x + r, y); ctx.lineTo(x, y + r);
      ctx.closePath();
    } else {
      ctx.arc(x, y, r, 0, Math.PI * 2);
    }

    const unitColor = UNIT_COLORS[u.unitType] || '#999';
    ctx.fillStyle = u.polymorphed ? '#FFF' : unitColor;
    ctx.fill();
    ctx.strokeStyle = player.color;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Carry indicator (workers)
    if (u.carryAmount > 0) {
      ctx.fillStyle = u.carryType === 'gold' ? '#FFD700' : u.carryType === 'oil' ? '#333' : '#0a5a0a';
      ctx.beginPath();
      ctx.arc(x + r * 0.6, y - r * 0.6, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // Buff indicators
    if (u.hasBuff('bloodlust')) {
      ctx.strokeStyle = '#f00';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(x, y, r + 3, 0, Math.PI * 2); ctx.stroke();
    }
    if (u.hasBuff('haste')) {
      ctx.strokeStyle = '#0ff';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(x, y, r + 4, 0, Math.PI * 2); ctx.stroke();
    }
    if (u.hasBuff('slow')) {
      ctx.strokeStyle = '#66f';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(x, y, r + 3, 0, Math.PI * 2); ctx.stroke();
    }
    if (u.hasBuff('invisible')) {
      ctx.globalAlpha = 0.4;
      ctx.fillStyle = '#aaf';
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }

    // HP bar
    if (u.hp < u.maxHp) {
      const barW = TILE * 0.7;
      const hpPct = u.hp / u.maxHp;
      ctx.fillStyle = '#333';
      ctx.fillRect(x - barW / 2, y - r - 7, barW, 3);
      ctx.fillStyle = hpPct > 0.5 ? '#0f0' : hpPct > 0.25 ? '#ff0' : '#f00';
      ctx.fillRect(x - barW / 2, y - r - 7, barW * hpPct, 3);
    }

    // Mana bar
    if (u.hasMana) {
      const barW = TILE * 0.7;
      const manaPct = u.mana / u.maxMana;
      ctx.fillStyle = '#113';
      ctx.fillRect(x - barW / 2, y - r - 4, barW, 2);
      ctx.fillStyle = '#33f';
      ctx.fillRect(x - barW / 2, y - r - 4, barW * manaPct, 2);
    }

    // Polymorphed indicator
    if (u.polymorphed) {
      ctx.fillStyle = '#fff';
      ctx.font = '10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('🐑', x, y + 3);
    }
  }

  drawSelection(ctx, e) {
    if (e instanceof Building) {
      const px = e.tx * TILE, py = e.ty * TILE;
      const size = e.size * TILE;
      ctx.strokeStyle = '#0f0';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(px - 2, py - 2, size + 4, size + 4);
      ctx.setLineDash([]);
    } else if (e instanceof Unit) {
      ctx.strokeStyle = '#0f0';
      ctx.lineWidth = 2;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.arc(e.px, e.py, TILE * 0.45, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  drawPlacementPreview(ctx) {
    const input = this.game.input;
    const tile = this.game.camera.screenToTile(this.game.input.mousePos.x || window.innerWidth / 2, this.game.input.mousePos.y || window.innerHeight / 2);
    const size = input.placementSize;
    const canPlace = this.game.map.canPlaceBuilding(tile.x, tile.y, size);

    ctx.fillStyle = canPlace ? 'rgba(0,255,0,0.3)' : 'rgba(255,0,0,0.3)';
    ctx.fillRect(tile.x * TILE, tile.y * TILE, size * TILE, size * TILE);
    ctx.strokeStyle = canPlace ? '#0f0' : '#f00';
    ctx.lineWidth = 2;
    ctx.strokeRect(tile.x * TILE, tile.y * TILE, size * TILE, size * TILE);
  }

  drawEffects(ctx) {
    for (const e of this.game.effects) {
      const alpha = clamp(e.timer / 0.3, 0, 1);

      switch (e.type) {
        case 'hit':
          ctx.fillStyle = `rgba(255,0,0,${alpha})`;
          ctx.beginPath(); ctx.arc(e.x, e.y, 6, 0, Math.PI * 2); ctx.fill();
          break;

        case 'magic_hit':
          ctx.fillStyle = `rgba(150,50,255,${alpha})`;
          ctx.beginPath(); ctx.arc(e.x, e.y, 10, 0, Math.PI * 2); ctx.fill();
          break;

        case 'heal':
          ctx.fillStyle = `rgba(0,255,100,${alpha})`;
          ctx.beginPath(); ctx.arc(e.x, e.y, 12, 0, Math.PI * 2); ctx.fill();
          break;

        case 'explosion':
          const er = (e.radius || 2) * TILE * (1 - alpha * 0.5);
          ctx.fillStyle = `rgba(255,150,0,${alpha * 0.6})`;
          ctx.beginPath(); ctx.arc(e.x, e.y, er, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = `rgba(255,255,0,${alpha * 0.4})`;
          ctx.beginPath(); ctx.arc(e.x, e.y, er * 0.5, 0, Math.PI * 2); ctx.fill();
          break;

        case 'projectile':
          const t = 1 - alpha;
          const px = lerp(e.x1, e.x2, t), py = lerp(e.y1, e.y2, t);
          ctx.fillStyle = '#ff0';
          ctx.beginPath(); ctx.arc(px, py, 3, 0, Math.PI * 2); ctx.fill();
          break;

        case 'move_marker':
          ctx.strokeStyle = `rgba(0,255,0,${alpha})`;
          ctx.lineWidth = 2;
          const ms = 8 * (2 - alpha);
          ctx.strokeRect(e.x - ms, e.y - ms, ms * 2, ms * 2);
          break;

        case 'aoe_zone':
          const zr = (e.radius || 3) * TILE;
          ctx.fillStyle = `rgba(100,0,200,${alpha * 0.3})`;
          ctx.beginPath(); ctx.arc(e.x, e.y, zr, 0, Math.PI * 2); ctx.fill();
          break;

        case 'buff':
          ctx.strokeStyle = `rgba(0,200,255,${alpha})`;
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(e.x, e.y, 15, 0, Math.PI * 2); ctx.stroke();
          break;

        case 'debuff':
          ctx.strokeStyle = `rgba(200,0,50,${alpha})`;
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(e.x, e.y, 15, 0, Math.PI * 2); ctx.stroke();
          break;

        case 'polymorph':
          ctx.fillStyle = `rgba(255,255,255,${alpha})`;
          ctx.beginPath(); ctx.arc(e.x, e.y, 14, 0, Math.PI * 2); ctx.fill();
          break;
      }
    }
  }

  drawMinimap() {
    const mctx = this.miniCtx;
    const mw = this.miniCanvas.width, mh = this.miniCanvas.height;
    const fog = this.game.fog;
    const map = this.game.map;
    const pid = this.game.humanPlayerId;
    const sx = mw / MAP_W, sy = mh / MAP_H;

    mctx.fillStyle = '#000';
    mctx.fillRect(0, 0, mw, mh);

    // Terrain
    for (let ty = 0; ty < MAP_H; ty++) {
      for (let tx = 0; tx < MAP_W; tx++) {
        const vis = fog.getVisibility(pid, tx, ty);
        if (vis === 0) continue;
        const tile = map.get(tx, ty);
        mctx.fillStyle = TERRAIN_COLORS[tile] || '#333';
        mctx.fillRect(tx * sx, ty * sy, Math.ceil(sx), Math.ceil(sy));
        if (vis === 1) {
          mctx.fillStyle = 'rgba(0,0,0,0.4)';
          mctx.fillRect(tx * sx, ty * sy, Math.ceil(sx), Math.ceil(sy));
        }
      }
    }

    // Entities on minimap
    for (const e of this.game.entities) {
      if (!e.alive) continue;
      if (e.playerId !== pid && !fog.isVisible(pid, e.tx, e.ty)) continue;

      const player = this.game.getPlayer(e.playerId);
      mctx.fillStyle = player.color;
      if (e instanceof Building) {
        mctx.fillRect(e.tx * sx, e.ty * sy, e.size * sx + 1, e.size * sy + 1);
      } else {
        mctx.fillRect(e.tx * sx, e.ty * sy, Math.max(2, sx), Math.max(2, sy));
      }
    }

    // Camera viewport
    const cam = this.game.camera;
    mctx.strokeStyle = '#fff';
    mctx.lineWidth = 1;
    mctx.strokeRect(
      cam.x / (MAP_W * TILE) * mw,
      cam.y / (MAP_H * TILE) * mh,
      cam.viewW / (MAP_W * TILE) * mw,
      cam.viewH / (MAP_H * TILE) * mh
    );
  }
}
