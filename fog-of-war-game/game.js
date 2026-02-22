// ============================================================
// GAME.JS - Main game class, loop, initialization
// ============================================================

class Game {
  constructor(faction) {
    this.humanFaction = faction;
    this.aiFaction = faction === FACTION.HUMANS ? FACTION.ORCS : FACTION.HUMANS;
    this.humanPlayerId = 1;
    this.aiPlayerId = 2;

    // Core systems
    this.map = new GameMap(MAP_W, MAP_H);
    this.fog = new FogOfWar(MAP_W, MAP_H);
    this.camera = new Camera();
    this.pathfinder = new PathFinder(this.map);

    // Players
    this.players = {
      1: new Player(1, this.humanFaction, false),
      2: new Player(2, this.aiFaction, true)
    };

    // Entities
    this.entities = [];
    this.effects = [];
    this.aoeZones = [];

    // Time
    this.time = 0;
    this.dt = 0;
    this.lastTime = 0;
    this.running = false;
    this.uiUpdateTimer = 0;

    // Init
    this.fog.initPlayer(1);
    this.fog.initPlayer(2);
    this.map.generate();

    // Init combat system
    initCombat(this);

    // Place starting bases
    this.placeStartingBase(this.humanPlayerId, this.humanFaction, 5, MAP_H - 9);
    this.placeStartingBase(this.aiPlayerId, this.aiFaction, MAP_W - 9, 5);

    // Systems that need DOM
    this.renderer = new Renderer(this);
    this.input = new InputHandler(this, document.getElementById('gameCanvas'));
    this.ui = new UIManager(this);
    this.ai = new AIController(this.aiPlayerId, this);

    // Center camera on player base
    this.camera.centerOn(5 * TILE + 64, (MAP_H - 9) * TILE + 64);

    // Make globally accessible
    window.game = this;
  }

  placeStartingBase(playerId, faction, bx, by) {
    // Town Hall
    const hall = new Building('townhall', bx, by, playerId, faction);
    hall.constructed = true;
    hall.constructionProgress = 1;
    hall.hp = hall.maxHp;
    this.map.placeBuilding(bx, by, hall.size, hall.id);
    this.entities.push(hall);

    // Initial Farm
    const farmX = bx + 5, farmY = by;
    const farm = new Building('farm', farmX, farmY, playerId, faction);
    farm.constructed = true;
    farm.constructionProgress = 1;
    farm.hp = farm.maxHp;
    this.map.placeBuilding(farmX, farmY, farm.size, farm.id);
    this.entities.push(farm);

    // 5 Peasants
    for (let i = 0; i < 5; i++) {
      const px = bx + 1 + i, py = by + hall.size + 1;
      if (this.map.isWalkable(px, py, 'ground')) {
        const peasant = new Unit('peasant', px, py, playerId, faction);
        this.map.occupy(px, py, peasant.id);
        this.entities.push(peasant);
      }
    }
  }

  getPlayer(id) { return this.players[id]; }

  getSelectedUnits() {
    return this.entities.filter(e => e.alive && e.selected && e instanceof Unit && e.playerId === this.humanPlayerId);
  }

  getSelectedEntities() {
    return this.entities.filter(e => e.alive && e.selected);
  }

  deselectAll() {
    this.entities.forEach(e => e.selected = false);
    document.getElementById('buildMenu').style.display = 'none';
    this.updateUI();
  }

  getEntityAt(tx, ty) {
    // Check buildings first (multi-tile)
    for (const e of this.entities) {
      if (!e.alive) continue;
      if (e instanceof Building) {
        if (tx >= e.tx && tx < e.tx + e.size && ty >= e.ty && ty < e.ty + e.size) return e;
      }
    }
    // Check units
    for (const e of this.entities) {
      if (!e.alive || !(e instanceof Unit)) continue;
      if (e.tx === tx && e.ty === ty) return e;
    }
    return null;
  }

  getEnemyUnitsInRange(entity, range) {
    const result = [];
    for (const e of this.entities) {
      if (!e.alive || e.playerId === entity.playerId || !(e instanceof Unit)) continue;
      if (e.hasBuff('invisible') && !entity.detectInvisible) continue;
      const d = tileDist(entity, e);
      if (d <= range) result.push(e);
    }
    result.sort((a, b) => tileDist(entity, a) - tileDist(entity, b));
    return result;
  }

  getEnemyBuildingsInRange(entity, range) {
    const result = [];
    for (const e of this.entities) {
      if (!e.alive || e.playerId === entity.playerId || !(e instanceof Building)) continue;
      const d = tileDist(entity, e);
      if (d <= range) result.push(e);
    }
    return result;
  }

  findNearestBuilding(playerId, tx, ty, types) {
    let best = null, bestD = Infinity;
    for (const e of this.entities) {
      if (!e.alive || e.playerId !== playerId || !(e instanceof Building) || !e.constructed) continue;
      if (types && !types.includes(e.buildingType)) continue;
      const d = tileDist({ tx, ty }, e);
      if (d < bestD) { bestD = d; best = e; }
    }
    return best;
  }

  spawnUnit(unitType, building, playerId) {
    const player = this.getPlayer(playerId);
    // Find spawn position near rally point
    const rx = building.rallyX, ry = building.rallyY;
    let spawnPos = this.map.findFreeTileNear(rx, ry, UNIT_DATA[unitType].type, 4);
    if (!spawnPos) spawnPos = this.map.findFreeTileNear(building.tx + building.size, building.ty + building.size, UNIT_DATA[unitType].type, 6);
    if (!spawnPos) return; // No space

    const unit = new Unit(unitType, spawnPos.x, spawnPos.y, playerId, player.faction);
    if (unit.moveType !== 'air') this.map.occupy(spawnPos.x, spawnPos.y, unit.id);
    this.entities.push(unit);

    if (playerId === this.humanPlayerId) {
      notify(unit.displayName + ' ready!');
    }
  }

  updateUI() {
    this.ui.updateSelection();
    this.ui.updateResources();
  }

  // Main update
  update(dt) {
    this.dt = dt;
    this.time += dt;

    // Update fog of war
    this.fog.resetVisible(this.humanPlayerId);
    this.fog.resetVisible(this.aiPlayerId);

    for (const e of this.entities) {
      if (!e.alive) continue;
      const sight = e.sight || (e instanceof Building ? e.size + 2 : 4);
      if (e instanceof Building) {
        for (let dy = 0; dy < e.size; dy++)
          for (let dx = 0; dx < e.size; dx++)
            this.fog.reveal(e.playerId, e.tx + dx, e.ty + dy, sight);
      } else {
        this.fog.reveal(e.playerId, e.tx, e.ty, sight);
      }
    }

    // Update entities
    for (const e of this.entities) {
      if (!e.alive) continue;
      e.update(dt, this);
    }

    // Update AoE zones
    updateAoEZones(this, dt);

    // Clean up dead entities
    for (let i = this.entities.length - 1; i >= 0; i--) {
      const e = this.entities[i];
      if (!e.alive) {
        if (e instanceof Unit && e.moveType !== 'air') {
          this.map.unoccupy(e.tx, e.ty);
        }
        if (e instanceof Building) {
          this.map.removeBuilding(e.tx, e.ty, e.size);
        }
        this.entities.splice(i, 1);
      }
    }

    // Update effects
    for (let i = this.effects.length - 1; i >= 0; i--) {
      this.effects[i].timer -= dt;
      if (this.effects[i].timer <= 0) this.effects.splice(i, 1);
    }

    // AI
    this.ai.update(dt);

    // UI updates (throttled)
    this.uiUpdateTimer += dt;
    if (this.uiUpdateTimer >= 0.5) {
      this.uiUpdateTimer = 0;
      this.ui.updateResources();
      this.ui.updateNotifications();

      // Also refresh selection panel if something is selected
      const sel = this.getSelectedEntities();
      if (sel.length > 0) this.ui.updateSelection();
    }

    // Check win/lose
    this.checkVictory();
  }

  checkVictory() {
    const humanBuildings = this.entities.filter(e => e.alive && e.playerId === this.humanPlayerId && e instanceof Building);
    const aiBuildings = this.entities.filter(e => e.alive && e.playerId === this.aiPlayerId && e instanceof Building);
    const humanUnits = this.entities.filter(e => e.alive && e.playerId === this.humanPlayerId && e instanceof Unit);
    const aiUnits = this.entities.filter(e => e.alive && e.playerId === this.aiPlayerId && e instanceof Unit);

    if (humanBuildings.length === 0 && humanUnits.length === 0) {
      this.running = false;
      notify('DEFEAT! Your base has been destroyed.');
      setTimeout(() => { if (confirm('You lost! Play again?')) location.reload(); }, 2000);
    } else if (aiBuildings.length === 0 && aiUnits.length === 0) {
      this.running = false;
      notify('VICTORY! Enemy has been vanquished!');
      setTimeout(() => { if (confirm('You won! Play again?')) location.reload(); }, 2000);
    }
  }

  // Game loop
  start() {
    this.running = true;
    this.lastTime = performance.now();
    this.loop();
  }

  loop() {
    if (!this.running) return;
    const now = performance.now();
    const dt = Math.min((now - this.lastTime) / 1000, 0.1); // Cap at 100ms
    this.lastTime = now;

    this.update(dt);
    this.renderer.render();

    requestAnimationFrame(() => this.loop());
  }
}

// ============================================================
// GAME START
// ============================================================

function startGame(faction) {
  document.getElementById('startScreen').style.display = 'none';
  const game = new Game(faction);
  game.start();
}
