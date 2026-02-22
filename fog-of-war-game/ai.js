// ============================================================
// AI.JS - Computer opponent logic
// ============================================================

class AIController {
  constructor(playerId, game) {
    this.playerId = playerId;
    this.game = game;
    this.timer = 0;
    this.state = 'early'; // early, mid, late, attack
    this.attackTimer = 0;
    this.buildQueue = [];
    this.attackWaveSize = 5;
    this.lastBuildCheck = 0;
    this.lastTrainCheck = 0;
    this.lastAttackCheck = 0;
    this.scoutSent = false;
  }

  get player() { return this.game.getPlayer(this.playerId); }

  getMyUnits() {
    return this.game.entities.filter(e => e.alive && e.playerId === this.playerId && e instanceof Unit);
  }

  getMyBuildings() {
    return this.game.entities.filter(e => e.alive && e.playerId === this.playerId && e instanceof Building && e.constructed);
  }

  getMyWorkers() {
    return this.getMyUnits().filter(u => u.isWorker);
  }

  getMyMilitary() {
    return this.getMyUnits().filter(u => !u.isWorker && !u.isScout);
  }

  getIdleWorkers() {
    return this.getMyWorkers().filter(w => w.workerState === 'idle' && !w.moving);
  }

  update(dt) {
    this.timer += dt;
    this.lastBuildCheck += dt;
    this.lastTrainCheck += dt;
    this.lastAttackCheck += dt;

    // Update state based on tech level and army size
    const military = this.getMyMilitary();
    if (this.player.techLevel >= 3) this.state = 'late';
    else if (this.player.techLevel >= 2) this.state = 'mid';
    else this.state = 'early';

    // Assign idle workers every 2s
    if (this.lastTrainCheck >= 2) {
      this.lastTrainCheck = 0;
      this.manageWorkers();
      this.trainUnits();
    }

    // Build logic every 3s
    if (this.lastBuildCheck >= 3) {
      this.lastBuildCheck = 0;
      this.manageBuild();
    }

    // Attack logic every 5s
    if (this.lastAttackCheck >= 5) {
      this.lastAttackCheck = 0;
      this.manageAttack();
    }
  }

  manageWorkers() {
    const idle = this.getIdleWorkers();
    for (const w of idle) {
      // Find nearest gold
      const gold = this.game.map.findNearestResource(w.tx, w.ty, 'gold', 30);
      if (gold) {
        w.gatherResource(gold.x, gold.y, this.game);
      } else {
        // Gather lumber
        const lumber = this.game.map.findNearestResource(w.tx, w.ty, 'lumber', 30);
        if (lumber) w.gatherResource(lumber.x, lumber.y, this.game);
      }
    }
  }

  trainUnits() {
    const workers = this.getMyWorkers();
    const buildings = this.getMyBuildings();
    const player = this.player;

    // Need more workers? (target: 6)
    if (workers.length < 6) {
      const hall = buildings.find(b => ['townhall', 'keep', 'castle'].includes(b.buildingType));
      if (hall && hall.trainQueue.length === 0 && player.canAfford(UNIT_DATA.peasant.cost)) {
        hall.trainUnit('peasant', this.game);
      }
    }

    // Train military
    const barracks = buildings.filter(b => b.buildingType === 'barracks');
    for (const b of barracks) {
      if (b.trainQueue.length >= 2) continue;
      if (player.foodUsed >= player.foodMax - 1) break;

      if (this.state === 'early') {
        if (player.canAfford(UNIT_DATA.footman.cost)) b.trainUnit('footman', this.game);
      } else if (this.state === 'mid') {
        if (player.meetsTrainReqs('knight') && player.canAfford(UNIT_DATA.knight.cost)) {
          b.trainUnit('knight', this.game);
        } else if (player.canAfford(UNIT_DATA.archer.cost)) {
          b.trainUnit('archer', this.game);
        } else if (player.canAfford(UNIT_DATA.footman.cost)) {
          b.trainUnit('footman', this.game);
        }
      } else {
        // Late game - mix
        const roll = Math.random();
        if (roll < 0.3 && player.meetsTrainReqs('knight') && player.canAfford(UNIT_DATA.knight.cost)) {
          b.trainUnit('knight', this.game);
        } else if (roll < 0.5 && player.meetsTrainReqs('paladin') && player.canAfford(UNIT_DATA.paladin.cost)) {
          b.trainUnit('paladin', this.game);
        } else if (player.canAfford(UNIT_DATA.footman.cost)) {
          b.trainUnit('footman', this.game);
        }
      }
    }

    // Train mages if available
    const mTower = buildings.find(b => b.buildingType === 'magetower');
    if (mTower && mTower.trainQueue.length === 0 && player.canAfford(UNIT_DATA.mage.cost) && player.meetsTrainReqs('mage')) {
      mTower.trainUnit('mage', this.game);
    }
  }

  manageBuild() {
    const buildings = this.getMyBuildings();
    const player = this.player;
    const hasFarm = buildings.some(b => b.buildingType === 'farm');
    const hasBarracks = buildings.some(b => b.buildingType === 'barracks');
    const hasLumberMill = buildings.some(b => b.buildingType === 'lumbermill');
    const hasBlacksmith = buildings.some(b => b.buildingType === 'blacksmith');
    const hasStables = buildings.some(b => b.buildingType === 'stables');
    const hasChurch = buildings.some(b => b.buildingType === 'church');
    const hasMageTower = buildings.some(b => b.buildingType === 'magetower');
    const farmCount = buildings.filter(b => b.buildingType === 'farm').length;
    const hall = buildings.find(b => ['townhall', 'keep', 'castle'].includes(b.buildingType));

    // Build order priority
    if (!hasBarracks && player.canAfford(BUILDING_DATA.barracks.cost)) {
      this.buildStructure('barracks');
    } else if (farmCount < 2 && player.canAfford(BUILDING_DATA.farm.cost)) {
      this.buildStructure('farm');
    } else if (!hasLumberMill && player.canAfford(BUILDING_DATA.lumbermill.cost)) {
      this.buildStructure('lumbermill');
    } else if (player.foodUsed >= player.foodMax - 2 && player.canAfford(BUILDING_DATA.farm.cost)) {
      this.buildStructure('farm');
    }

    // Upgrade town hall
    if (hall && player.techLevel === 1 && player.gold > 1500 && player.lumber > 800) {
      hall.upgradeBuilding('keep', this.game);
    } else if (hall && player.techLevel === 2 && player.gold > 2500 && player.lumber > 1200) {
      hall.upgradeBuilding('castle', this.game);
    }

    // Mid game buildings
    if (this.state === 'mid' || this.state === 'late') {
      if (!hasBlacksmith && player.canAfford(BUILDING_DATA.blacksmith.cost) && player.meetsBuildReqs('blacksmith')) {
        this.buildStructure('blacksmith');
      }
      if (!hasStables && player.canAfford(BUILDING_DATA.stables.cost) && player.meetsBuildReqs('stables')) {
        this.buildStructure('stables');
      }
      // Second barracks
      const barracksCount = buildings.filter(b => b.buildingType === 'barracks').length;
      if (barracksCount < 2 && player.canAfford(BUILDING_DATA.barracks.cost)) {
        this.buildStructure('barracks');
      }
    }

    // Late game
    if (this.state === 'late') {
      if (!hasChurch && player.canAfford(BUILDING_DATA.church.cost) && player.meetsBuildReqs('church')) {
        this.buildStructure('church');
      }
      if (!hasMageTower && player.canAfford(BUILDING_DATA.magetower.cost) && player.meetsBuildReqs('magetower')) {
        this.buildStructure('magetower');
      }
    }
  }

  buildStructure(buildingType) {
    const workers = this.getIdleWorkers();
    if (workers.length === 0) {
      // Grab any worker
      const allWorkers = this.getMyWorkers();
      if (allWorkers.length === 0) return;
      workers.push(allWorkers[0]);
    }

    const builder = workers[0];
    const bdata = BUILDING_DATA[buildingType];
    const player = this.player;

    // Find suitable location near town hall
    const hall = this.getMyBuildings().find(b => ['townhall', 'keep', 'castle'].includes(b.buildingType));
    if (!hall) return;

    const size = bdata.size;
    let placed = false;

    for (let attempt = 0; attempt < 50 && !placed; attempt++) {
      const bx = hall.tx + randInt(-8, 8);
      const by = hall.ty + randInt(-8, 8);
      if (this.game.map.canPlaceBuilding(bx, by, size)) {
        // Create construction
        player.spend(bdata.cost);
        const building = new Building(buildingType, bx, by, this.playerId, player.faction);
        this.game.map.placeBuilding(bx, by, size, building.id);
        this.game.entities.push(building);
        builder.startBuilding(building, this.game);
        placed = true;
      }
    }
  }

  manageAttack() {
    const military = this.getMyMilitary();

    // Attack when we have enough units
    const threshold = this.state === 'early' ? 4 : this.state === 'mid' ? 8 : 12;

    if (military.length >= threshold) {
      // Find enemy buildings or units
      const enemies = this.game.entities.filter(e =>
        e.alive && e.playerId !== this.playerId && (e instanceof Building || e instanceof Unit)
      );

      if (enemies.length === 0) return;

      // Target priority: enemy town hall > barracks > other buildings > units
      let target = enemies.find(e => e instanceof Building && ['townhall', 'keep', 'castle'].includes(e.buildingType));
      if (!target) target = enemies.find(e => e instanceof Building);
      if (!target) target = enemies[0];

      for (const unit of military) {
        if (!unit.attackTarget) {
          unit.attackTarget = target;
          unit.moveToward(target.tx, target.ty, this.game);
        }
      }
    }

    // Send early scout
    if (!this.scoutSent && military.length >= 1) {
      const scout = military[0];
      // Move toward center of map
      scout.moveTo(MAP_W / 2, MAP_H / 2, this.game);
      this.scoutSent = true;
    }
  }
}
