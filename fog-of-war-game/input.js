// ============================================================
// INPUT.JS - Touch/mouse input, camera control
// ============================================================

class Camera {
  constructor() {
    this.x = 0; this.y = 0;
    this.zoom = 1.0;
    this.minZoom = 0.5;
    this.maxZoom = 2.0;
    this.screenW = 0;
    this.screenH = 0;
  }

  get viewW() { return this.screenW / this.zoom; }
  get viewH() { return this.screenH / this.zoom; }

  setSize(w, h) { this.screenW = w; this.screenH = h; }

  centerOn(px, py) {
    this.x = px - this.viewW / 2;
    this.y = py - this.viewH / 2;
    this.clamp();
  }

  clamp() {
    this.x = clamp(this.x, 0, MAP_W * TILE - this.viewW);
    this.y = clamp(this.y, 0, MAP_H * TILE - this.viewH);
  }

  screenToWorld(sx, sy) {
    return { x: sx / this.zoom + this.x, y: sy / this.zoom + this.y };
  }

  worldToScreen(wx, wy) {
    return { x: (wx - this.x) * this.zoom, y: (wy - this.y) * this.zoom };
  }

  screenToTile(sx, sy) {
    const w = this.screenToWorld(sx, sy);
    return { x: Math.floor(w.x / TILE), y: Math.floor(w.y / TILE) };
  }
}

class InputHandler {
  constructor(game, canvas) {
    this.game = game;
    this.canvas = canvas;
    this.camera = game.camera;

    // Touch state
    this.touches = {};
    this.lastTap = 0;
    this.lastTapPos = null;
    this.isDragging = false;
    this.dragStart = null;
    this.pinchDist = 0;
    this.isPinching = false;

    // Mouse state
    this.mouseDown = false;
    this.mousePos = { x: 0, y: 0 };
    this.rightClick = false;

    // Placement mode
    this.placementMode = false;
    this.placementType = null;
    this.placementSize = 0;

    // Spell targeting mode
    this.spellMode = false;
    this.spellId = null;
    this.spellCaster = null;

    this.initListeners();
  }

  initListeners() {
    const c = this.canvas;

    // Touch events
    c.addEventListener('touchstart', e => this.onTouchStart(e), { passive: false });
    c.addEventListener('touchmove', e => this.onTouchMove(e), { passive: false });
    c.addEventListener('touchend', e => this.onTouchEnd(e), { passive: false });
    c.addEventListener('touchcancel', e => this.onTouchEnd(e), { passive: false });

    // Mouse events
    c.addEventListener('mousedown', e => this.onMouseDown(e));
    c.addEventListener('mousemove', e => this.onMouseMove(e));
    c.addEventListener('mouseup', e => this.onMouseUp(e));
    c.addEventListener('contextmenu', e => e.preventDefault());
    c.addEventListener('wheel', e => this.onWheel(e), { passive: false });

    // Prevent default on build menu and other UI
    document.getElementById('buildMenu').addEventListener('touchstart', e => e.stopPropagation());

    // Keyboard (for desktop testing)
    document.addEventListener('keydown', e => this.onKeyDown(e));

    // Placement hint cancel
    document.getElementById('placementHint').addEventListener('click', () => this.cancelPlacement());
    document.getElementById('placementHint').addEventListener('touchstart', e => {
      e.preventDefault(); e.stopPropagation(); this.cancelPlacement();
    });
  }

  onTouchStart(e) {
    e.preventDefault();
    const rect = this.canvas.getBoundingClientRect();

    for (const t of e.changedTouches) {
      this.touches[t.identifier] = {
        x: t.clientX - rect.left, y: t.clientY - rect.top,
        startX: t.clientX - rect.left, startY: t.clientY - rect.top,
        startTime: Date.now()
      };
    }

    const touchCount = Object.keys(this.touches).length;

    if (touchCount === 2) {
      this.isPinching = true;
      const ids = Object.keys(this.touches);
      const t1 = this.touches[ids[0]], t2 = this.touches[ids[1]];
      this.pinchDist = dist(t1.x, t1.y, t2.x, t2.y);
    } else if (touchCount === 1) {
      this.isDragging = false;
      this.dragStart = { x: Object.values(this.touches)[0].x, y: Object.values(this.touches)[0].y };
    }
  }

  onTouchMove(e) {
    e.preventDefault();
    const rect = this.canvas.getBoundingClientRect();

    for (const t of e.changedTouches) {
      if (this.touches[t.identifier]) {
        this.touches[t.identifier].x = t.clientX - rect.left;
        this.touches[t.identifier].y = t.clientY - rect.top;
      }
    }

    const ids = Object.keys(this.touches);

    if (this.isPinching && ids.length === 2) {
      const t1 = this.touches[ids[0]], t2 = this.touches[ids[1]];
      const newDist = dist(t1.x, t1.y, t2.x, t2.y);
      const scale = newDist / this.pinchDist;
      this.camera.zoom = clamp(this.camera.zoom * scale, this.camera.minZoom, this.camera.maxZoom);
      this.camera.clamp();
      this.pinchDist = newDist;
    } else if (ids.length === 1 && this.dragStart) {
      const t = this.touches[ids[0]];
      const dx = t.x - this.dragStart.x;
      const dy = t.y - this.dragStart.y;
      if (Math.abs(dx) > 5 || Math.abs(dy) > 5) this.isDragging = true;
      if (this.isDragging) {
        this.camera.x -= dx / this.camera.zoom;
        this.camera.y -= dy / this.camera.zoom;
        this.camera.clamp();
        this.dragStart = { x: t.x, y: t.y };
      }
    }
  }

  onTouchEnd(e) {
    e.preventDefault();
    const rect = this.canvas.getBoundingClientRect();

    for (const t of e.changedTouches) {
      const touch = this.touches[t.identifier];
      if (touch) {
        const elapsed = Date.now() - touch.startTime;
        const moved = dist(touch.startX, touch.startY, touch.x, touch.y);

        // Tap detection
        if (elapsed < 300 && moved < 15 && !this.isPinching) {
          this.handleTap(touch.x, touch.y);
        }
        delete this.touches[t.identifier];
      }
    }

    if (Object.keys(this.touches).length < 2) this.isPinching = false;
    if (Object.keys(this.touches).length === 0) { this.isDragging = false; this.dragStart = null; }
  }

  onMouseDown(e) {
    const rect = this.canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;

    if (e.button === 2) {
      // Right click = command
      this.rightClick = true;
      this.handleCommand(mx, my);
    } else {
      this.mouseDown = true;
      this.dragStart = { x: mx, y: my };
      this.isDragging = false;
    }
  }

  onMouseMove(e) {
    const rect = this.canvas.getBoundingClientRect();
    this.mousePos = { x: e.clientX - rect.left, y: e.clientY - rect.top };

    if (this.mouseDown && this.dragStart) {
      const dx = this.mousePos.x - this.dragStart.x;
      const dy = this.mousePos.y - this.dragStart.y;
      if (Math.abs(dx) > 5 || Math.abs(dy) > 5) this.isDragging = true;
      if (this.isDragging) {
        this.camera.x -= dx / this.camera.zoom;
        this.camera.y -= dy / this.camera.zoom;
        this.camera.clamp();
        this.dragStart = { x: this.mousePos.x, y: this.mousePos.y };
      }
    }
  }

  onMouseUp(e) {
    const rect = this.canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;

    if (e.button === 0 && !this.isDragging) {
      this.handleTap(mx, my);
    }
    this.mouseDown = false;
    this.isDragging = false;
    this.rightClick = false;
  }

  onWheel(e) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    this.camera.zoom = clamp(this.camera.zoom * delta, this.camera.minZoom, this.camera.maxZoom);
    this.camera.clamp();
  }

  onKeyDown(e) {
    if (e.key === 'Escape') {
      this.cancelPlacement();
      this.cancelSpell();
      this.game.deselectAll();
    }
  }

  handleTap(sx, sy) {
    // Check if tap is on UI areas
    if (sy < 36 || sy > this.canvas.height - 140) return;

    const tile = this.camera.screenToTile(sx, sy);
    const world = this.camera.screenToWorld(sx, sy);

    // Placement mode
    if (this.placementMode) {
      this.attemptPlacement(tile.x, tile.y);
      return;
    }

    // Spell targeting mode
    if (this.spellMode) {
      this.attemptSpell(tile.x, tile.y, world.x, world.y);
      return;
    }

    // Try to select entity at position
    const entity = this.game.getEntityAt(tile.x, tile.y);

    if (entity) {
      // If we have selected units and tap enemy - attack
      const selected = this.game.getSelectedUnits();
      if (selected.length > 0 && entity.playerId !== this.game.humanPlayerId) {
        for (const u of selected) {
          u.attackTarget = entity;
          u.moveToward(entity.tx, entity.ty, this.game);
        }
        return;
      }

      // If we have selected worker and tap resource
      if (selected.length === 1 && selected[0].isWorker) {
        const r = this.game.map.getResource(tile.x, tile.y);
        if (r) {
          selected[0].gatherResource(tile.x, tile.y, this.game);
          return;
        }
        // Tap own building - repair
        if (entity instanceof Building && entity.playerId === this.game.humanPlayerId && entity.hp < entity.maxHp) {
          selected[0].startRepair(entity, this.game);
          return;
        }
      }

      // Select entity
      this.game.deselectAll();
      entity.selected = true;
      this.game.updateUI();
    } else {
      // Tap on ground
      const selected = this.game.getSelectedUnits();
      if (selected.length > 0) {
        // Move command
        for (const u of selected) {
          if (u.playerId === this.game.humanPlayerId) {
            if (u.isWorker) {
              const r = this.game.map.getResource(tile.x, tile.y);
              if (r) { u.gatherResource(tile.x, tile.y, this.game); continue; }
            }
            u.moveTo(tile.x, tile.y, this.game);
          }
        }
        // Move indicator
        this.game.addEffect({ type: 'move_marker', x: tile.x * TILE + TILE / 2, y: tile.y * TILE + TILE / 2, timer: 0.5 });
      } else {
        this.game.deselectAll();
        this.game.updateUI();
      }
    }
  }

  handleCommand(sx, sy) {
    // Right-click command (desktop)
    if (sy < 36 || sy > this.canvas.height - 140) return;
    const tile = this.camera.screenToTile(sx, sy);
    const selected = this.game.getSelectedUnits();
    if (selected.length === 0) return;

    const entity = this.game.getEntityAt(tile.x, tile.y);

    if (entity && entity.playerId !== this.game.humanPlayerId) {
      // Attack
      for (const u of selected) {
        u.attackTarget = entity;
        u.moveToward(entity.tx, entity.ty, this.game);
      }
    } else if (entity && entity.playerId === this.game.humanPlayerId && entity instanceof Building) {
      // Rally point or repair
      if (selected.some(u => u.isWorker)) {
        for (const u of selected) {
          if (u.isWorker && entity.hp < entity.maxHp) u.startRepair(entity, this.game);
        }
      }
    } else {
      // Move
      for (const u of selected) {
        if (u.isWorker) {
          const r = this.game.map.getResource(tile.x, tile.y);
          if (r) { u.gatherResource(tile.x, tile.y, this.game); continue; }
        }
        u.moveTo(tile.x, tile.y, this.game);
      }
      this.game.addEffect({ type: 'move_marker', x: tile.x * TILE + TILE / 2, y: tile.y * TILE + TILE / 2, timer: 0.5 });
    }
  }

  enterPlacementMode(buildingType) {
    this.placementMode = true;
    this.placementType = buildingType;
    this.placementSize = BUILDING_DATA[buildingType].size;
    document.getElementById('placementHint').style.display = 'block';
    document.getElementById('buildMenu').style.display = 'none';
  }

  cancelPlacement() {
    this.placementMode = false;
    this.placementType = null;
    document.getElementById('placementHint').style.display = 'none';
  }

  attemptPlacement(tx, ty) {
    const size = this.placementSize;
    const btype = this.placementType;
    const player = this.game.getPlayer(this.game.humanPlayerId);

    if (!this.game.map.canPlaceBuilding(tx, ty, size)) {
      notify('Cannot build here!');
      return;
    }

    // Check cost
    const bdata = BUILDING_DATA[btype];
    if (!player.canAfford(bdata.cost)) {
      notify('Not enough resources!');
      return;
    }

    player.spend(bdata.cost);

    const building = new Building(btype, tx, ty, this.game.humanPlayerId, player.faction);
    this.game.map.placeBuilding(tx, ty, size, building.id);
    this.game.entities.push(building);

    // Send selected worker to build
    const workers = this.game.getSelectedUnits().filter(u => u.isWorker);
    if (workers.length > 0) {
      workers[0].startBuilding(building, this.game);
    } else {
      // Find nearest idle worker
      const allWorkers = this.game.entities.filter(e =>
        e.alive && e.playerId === this.game.humanPlayerId && e instanceof Unit && e.isWorker
      );
      if (allWorkers.length > 0) {
        allWorkers[0].startBuilding(building, this.game);
      }
    }

    this.cancelPlacement();
    this.game.updateUI();
  }

  enterSpellMode(spellId, caster) {
    this.spellMode = true;
    this.spellId = spellId;
    this.spellCaster = caster;
    document.getElementById('placementHint').textContent = SPELL_DATA[spellId].name + ' - Tap target';
    document.getElementById('placementHint').style.display = 'block';
  }

  cancelSpell() {
    this.spellMode = false;
    this.spellId = null;
    this.spellCaster = null;
    document.getElementById('placementHint').style.display = 'none';
  }

  attemptSpell(tx, ty) {
    const spell = SPELL_DATA[this.spellId];
    const caster = this.spellCaster;

    if (!spell || !caster || !caster.alive) { this.cancelSpell(); return; }

    const d = tileDist(caster, { tx, ty });
    if (spell.range > 0 && d > spell.range) {
      notify('Out of range!');
      return;
    }

    let target = null;
    if (spell.target === 'enemy' || spell.target === 'friendly') {
      target = this.game.getEntityAt(tx, ty);
      if (!target) { notify('No target!'); return; }
      if (spell.target === 'enemy' && target.playerId === caster.playerId) { notify('Must target enemy!'); return; }
      if (spell.target === 'friendly' && target.playerId !== caster.playerId) { notify('Must target friendly!'); return; }
    } else {
      target = { tx, ty, x: tx, y: ty };
    }

    SpellSystem.cast(caster, this.spellId, target, this.game);
    this.cancelSpell();
  }
}
