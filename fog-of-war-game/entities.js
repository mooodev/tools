// ============================================================
// ENTITIES.JS - Units and Buildings
// ============================================================

class Entity {
  constructor(type, tx, ty, playerId) {
    this.id = nextId();
    this.type = type;
    this.tx = tx; this.ty = ty; // tile position
    this.px = tx * TILE + TILE / 2; // pixel position (center)
    this.py = ty * TILE + TILE / 2;
    this.playerId = playerId;
    this.hp = 0; this.maxHp = 0;
    this.alive = true;
    this.selected = false;
    this.buffs = {}; // effect -> {duration, remaining}
  }

  get centerX() { return this.px; }
  get centerY() { return this.py; }

  takeDamage(dmg) {
    if (!this.alive) return;
    this.hp -= dmg;
    if (this.hp <= 0) { this.hp = 0; this.alive = false; this.onDeath(); }
  }

  heal(amount) {
    this.hp = Math.min(this.maxHp, this.hp + amount);
  }

  onDeath() {}

  addBuff(effect, duration) {
    this.buffs[effect] = { duration, remaining: duration };
  }

  hasBuff(effect) { return this.buffs[effect] && this.buffs[effect].remaining > 0; }

  updateBuffs(dt) {
    for (const key in this.buffs) {
      this.buffs[key].remaining -= dt;
      if (this.buffs[key].remaining <= 0) delete this.buffs[key];
    }
  }
}

// ============================================================
// UNIT
// ============================================================
class Unit extends Entity {
  constructor(unitType, tx, ty, playerId, faction) {
    super(unitType, tx, ty, playerId);
    const data = UNIT_DATA[unitType];
    this.unitType = unitType;
    this.faction = faction;
    this.hp = data.hp;
    this.maxHp = data.hp;
    this.armor = data.armor;
    this.basicDmg = data.basicDmg;
    this.pierceDmg = data.pierceDmg;
    this.range = data.range;
    this.baseSpeed = data.speed;
    this.sight = data.sight;
    this.moveType = data.type; // ground, air, naval
    this.size = data.size;
    this.isWorker = !!data.isWorker;
    this.isSiege = !!data.isSiege;
    this.isDemo = !!data.isDemo;
    this.isCaster = !!data.isCaster;
    this.hasMana = !!data.hasMana;
    this.isScout = !!data.isScout;
    this.isStealthy = !!data.isStealthy;
    this.detectInvisible = !!data.detectInvisible;
    this.isOilWorker = !!data.isOilWorker;
    this.splash = data.splash || 0;
    this.mana = data.mana || 0;
    this.maxMana = data.mana || 0;
    this.capacity = data.capacity || 0;
    this.cargo = []; // for transports

    // Movement
    this.path = [];
    this.moving = false;
    this.moveProgress = 0;
    this.targetTx = tx; this.targetTy = ty;
    this.nextTx = tx; this.nextTy = ty;

    // Combat
    this.attackTarget = null;
    this.attackCooldown = 0;
    this.attackRate = data.range > 1 ? 1.0 : 0.8; // seconds between attacks

    // Worker state
    this.workerState = 'idle'; // idle, moving_to_resource, gathering, returning, building, repairing
    this.carryType = null;
    this.carryAmount = 0;
    this.gatherTarget = null;
    this.gatherTimer = 0;
    this.buildTarget = null;

    // Summon duration
    this.duration = data.duration || 0;
    this.summonTimer = 0;

    // Polymorphed
    this.polymorphed = false;

    // Animation state
    this.animFrame = 0;
    this.animTimer = 0;
    this.facing = 2; // 0=N,1=NE,2=E,3=SE,4=S,5=SW,6=W,7=NW
  }

  get speed() {
    let s = this.baseSpeed;
    if (this.hasBuff('slow')) s *= 0.5;
    if (this.hasBuff('haste')) s *= 2.0;
    if (this.isWorker && this.carryAmount > 0) s *= 0.7;
    return s;
  }

  get effectiveDmg() {
    let b = this.basicDmg, p = this.pierceDmg;
    if (this.hasBuff('bloodlust')) { b *= 2; p *= 2; }
    return { basic: b, pierce: p };
  }

  get displayName() {
    if (this.polymorphed) return 'Critter';
    const d = UNIT_DATA[this.unitType];
    return this.faction === FACTION.ORCS ? (d.nameorc || d.name) : d.name;
  }

  update(dt, game) {
    if (!this.alive) return;
    this.updateBuffs(dt);
    this.animTimer += dt;

    // Summon duration check
    if (this.duration > 0) {
      this.summonTimer += dt;
      if (this.summonTimer >= this.duration / FPS) { this.alive = false; return; }
    }

    // Mana regen (1 per 2 seconds)
    if (this.hasMana && this.mana < this.maxMana) {
      this.mana = Math.min(this.maxMana, this.mana + dt * 0.5);
    }

    if (this.polymorphed) return;

    // Worker logic
    if (this.isWorker) { this.updateWorker(dt, game); return; }

    // Combat: auto-attack nearby enemies
    if (this.attackTarget) {
      if (!this.attackTarget.alive) { this.attackTarget = null; }
      else {
        const d = tileDist(this, this.attackTarget);
        if (d <= this.range) {
          this.attackEntity(dt, this.attackTarget, game);
          return;
        } else if (!this.moving) {
          this.moveToward(this.attackTarget.tx, this.attackTarget.ty, game);
        }
      }
    }

    // Movement
    if (this.path.length > 0 || this.moving) {
      this.updateMovement(dt, game);
    } else if (!this.attackTarget) {
      // Auto-aggro nearby enemies
      this.autoAggro(game);
    }
  }

  autoAggro(game) {
    if (this.isScout || this.pierceDmg === 0 && this.basicDmg === 0) return;
    const enemies = game.getEnemyUnitsInRange(this, this.sight);
    if (enemies.length > 0) {
      this.attackTarget = enemies[0];
    }
    // Also check enemy buildings
    if (!this.attackTarget) {
      const eBuildings = game.getEnemyBuildingsInRange(this, this.sight);
      if (eBuildings.length > 0 && this.range >= 1) {
        this.attackTarget = eBuildings[0];
      }
    }
  }

  attackEntity(dt, target, game) {
    this.attackCooldown -= dt;
    if (this.attackCooldown <= 0) {
      // Demo units explode
      if (this.isDemo) {
        game.demoExplode(this);
        return;
      }
      game.dealDamage(this, target);
      this.attackCooldown = this.attackRate;
      // Face target
      this.faceToward(target.tx, target.ty);
    }
  }

  faceToward(tx, ty) {
    const dx = tx - this.tx, dy = ty - this.ty;
    if (dx === 0 && dy < 0) this.facing = 0;
    else if (dx > 0 && dy < 0) this.facing = 1;
    else if (dx > 0 && dy === 0) this.facing = 2;
    else if (dx > 0 && dy > 0) this.facing = 3;
    else if (dx === 0 && dy > 0) this.facing = 4;
    else if (dx < 0 && dy > 0) this.facing = 5;
    else if (dx < 0 && dy === 0) this.facing = 6;
    else if (dx < 0 && dy < 0) this.facing = 7;
  }

  moveTo(tx, ty, game) {
    this.attackTarget = null;
    this.workerState = 'idle';
    this.buildTarget = null;
    this.gatherTarget = null;
    const path = game.pathfinder.findPath(this.tx, this.ty, tx, ty, this.moveType);
    this.path = path;
    this.targetTx = tx;
    this.targetTy = ty;
  }

  moveToward(tx, ty, game) {
    const path = game.pathfinder.findPath(this.tx, this.ty, tx, ty, this.moveType);
    this.path = path;
  }

  attackMove(tx, ty, game) {
    this.moveTo(tx, ty, game);
    // Will auto-aggro while moving
  }

  updateMovement(dt, game) {
    if (!this.moving && this.path.length > 0) {
      const next = this.path[0];
      // Check if next tile is still walkable
      if (!game.map.isWalkable(next.x, next.y, this.moveType)) {
        // Recalculate path
        this.path = game.pathfinder.findPath(this.tx, this.ty, this.targetTx, this.targetTy, this.moveType);
        if (this.path.length === 0) return;
        return;
      }
      this.nextTx = next.x;
      this.nextTy = next.y;
      this.path.shift();
      this.moving = true;
      this.moveProgress = 0;
      // Reserve next tile
      game.map.unoccupy(this.tx, this.ty);
      if (this.moveType !== 'air') game.map.occupy(this.nextTx, this.nextTy, this.id);
      this.faceToward(this.nextTx, this.nextTy);
    }

    if (this.moving) {
      this.moveProgress += dt * this.speed;
      const t = clamp(this.moveProgress, 0, 1);
      this.px = lerp(this.tx * TILE + TILE / 2, this.nextTx * TILE + TILE / 2, t);
      this.py = lerp(this.ty * TILE + TILE / 2, this.nextTy * TILE + TILE / 2, t);

      if (this.moveProgress >= 1) {
        this.tx = this.nextTx;
        this.ty = this.nextTy;
        this.px = this.tx * TILE + TILE / 2;
        this.py = this.ty * TILE + TILE / 2;
        this.moving = false;

        // Check for auto-aggro while moving
        if (this.attackTarget === null && this.path.length > 0) {
          const enemies = game.getEnemyUnitsInRange(this, this.sight * 0.5);
          if (enemies.length > 0 && !this.isWorker) {
            this.attackTarget = enemies[0];
            this.path = [];
          }
        }
      }
    }
  }

  // Worker-specific logic
  updateWorker(dt, game) {
    switch (this.workerState) {
      case 'idle':
        // If carrying resources, return them
        if (this.carryAmount > 0) {
          this.returnResources(game);
        }
        break;

      case 'moving_to_resource':
        if (this.path.length === 0 && !this.moving) {
          // Arrived near resource?
          if (this.gatherTarget) {
            const d = tileDist(this, { tx: this.gatherTarget.x, ty: this.gatherTarget.y });
            if (d <= 1.5) {
              this.workerState = 'gathering';
              this.gatherTimer = 0;
            } else {
              // Try to get closer
              this.moveToward(this.gatherTarget.x, this.gatherTarget.y, game);
              if (this.path.length === 0) this.workerState = 'idle';
            }
          } else {
            this.workerState = 'idle';
          }
        } else {
          this.updateMovement(dt, game);
        }
        break;

      case 'gathering':
        this.gatherTimer += dt;
        const gatherTime = this.gatherTarget && this.gatherTarget.type === 'gold' ? 3.0 : 2.0;
        if (this.gatherTimer >= gatherTime) {
          if (this.gatherTarget) {
            const r = game.map.getResource(this.gatherTarget.x, this.gatherTarget.y);
            if (r && r.amount > 0) {
              let amount = 100;
              if (r.type === 'gold') {
                const hallLevel = game.getPlayer(this.playerId).techLevel;
                amount = GOLD_CARRY[hallLevel] || 100;
              }
              const taken = game.map.harvestResource(this.gatherTarget.x, this.gatherTarget.y, amount);
              this.carryType = r.type;
              this.carryAmount = taken;
            }
          }
          this.returnResources(game);
        }
        break;

      case 'returning':
        if (this.path.length === 0 && !this.moving) {
          // Find nearest town hall
          const hall = game.findNearestBuilding(this.playerId, this.tx, this.ty, ['townhall', 'keep', 'castle']);
          if (hall) {
            const d = tileDist(this, hall);
            if (d <= hall.bdata.size) {
              // Deliver resources
              const player = game.getPlayer(this.playerId);
              if (this.carryType === 'gold') player.gold += this.carryAmount;
              else if (this.carryType === 'lumber') player.lumber += this.carryAmount;
              else if (this.carryType === 'oil') player.oil += this.carryAmount;
              this.carryAmount = 0;
              this.carryType = null;

              // Go back to gather more
              if (this.gatherTarget) {
                const r = game.map.getResource(this.gatherTarget.x, this.gatherTarget.y);
                if (r && r.amount > 0) {
                  this.gatherResource(this.gatherTarget.x, this.gatherTarget.y, game);
                } else {
                  // Find another resource of same type nearby
                  const nearby = game.map.findNearestResource(this.tx, this.ty, this.gatherTarget.type);
                  if (nearby) this.gatherResource(nearby.x, nearby.y, game);
                  else this.workerState = 'idle';
                }
              } else {
                this.workerState = 'idle';
              }
            } else {
              this.moveToward(hall.tx + 1, hall.ty + 1, game);
            }
          } else {
            this.workerState = 'idle';
          }
        } else {
          this.updateMovement(dt, game);
        }
        break;

      case 'building':
        if (this.buildTarget && this.buildTarget.alive && this.buildTarget.constructionProgress < 1) {
          const d = tileDist(this, this.buildTarget);
          if (d <= 2) {
            this.buildTarget.constructionProgress += dt / (this.buildTarget.bdata.buildTime * TIME_SCALE);
            if (this.buildTarget.constructionProgress >= 1) {
              this.buildTarget.constructionProgress = 1;
              this.buildTarget.constructed = true;
              this.buildTarget.hp = this.buildTarget.maxHp;
              this.workerState = 'idle';
              notify(this.buildTarget.displayName + ' complete!');
            }
          } else if (!this.moving && this.path.length === 0) {
            this.moveToward(this.buildTarget.tx, this.buildTarget.ty, game);
          } else {
            this.updateMovement(dt, game);
          }
        } else {
          this.workerState = 'idle';
        }
        break;

      case 'repairing':
        if (this.buildTarget && this.buildTarget.alive && this.buildTarget.hp < this.buildTarget.maxHp) {
          const d = tileDist(this, this.buildTarget);
          if (d <= 2) {
            // Repair: costs gold/lumber proportional
            const repairRate = this.buildTarget.maxHp * 0.01; // 1% per second
            this.buildTarget.hp = Math.min(this.buildTarget.maxHp, this.buildTarget.hp + repairRate * dt);
            const player = game.getPlayer(this.playerId);
            player.gold -= 1 * dt;
            player.lumber -= 0.5 * dt;
          } else if (!this.moving && this.path.length === 0) {
            this.moveToward(this.buildTarget.tx, this.buildTarget.ty, game);
          } else {
            this.updateMovement(dt, game);
          }
        } else {
          this.workerState = 'idle';
        }
        break;

      default:
        this.updateMovement(dt, game);
        break;
    }
  }

  gatherResource(rx, ry, game) {
    const r = game.map.getResource(rx, ry);
    if (!r) return;
    this.gatherTarget = { x: rx, y: ry, type: r.type };
    this.workerState = 'moving_to_resource';
    this.attackTarget = null;
    // Find walkable tile adjacent to resource
    const free = game.map.findFreeTileNear(rx, ry, this.moveType, 2);
    if (free) {
      this.path = game.pathfinder.findPath(this.tx, this.ty, free.x, free.y, this.moveType);
    } else {
      this.path = game.pathfinder.findPath(this.tx, this.ty, rx, ry, this.moveType);
    }
    this.targetTx = rx; this.targetTy = ry;
  }

  returnResources(game) {
    const hall = game.findNearestBuilding(this.playerId, this.tx, this.ty, ['townhall', 'keep', 'castle']);
    if (hall) {
      this.workerState = 'returning';
      this.moveToward(hall.tx + 1, hall.ty + 1, game);
    } else {
      this.workerState = 'idle';
    }
  }

  startBuilding(building, game) {
    this.buildTarget = building;
    this.workerState = 'building';
    this.attackTarget = null;
    this.gatherTarget = null;
    this.moveToward(building.tx, building.ty, game);
  }

  startRepair(building, game) {
    this.buildTarget = building;
    this.workerState = 'repairing';
    this.attackTarget = null;
    this.moveToward(building.tx, building.ty, game);
  }

  onDeath() {
    // Free occupancy
    if (this.moveType !== 'air') {
      // Will be cleaned up by game
    }
  }
}

// ============================================================
// BUILDING
// ============================================================
class Building extends Entity {
  constructor(buildingType, tx, ty, playerId, faction) {
    super(buildingType, tx, ty, playerId);
    const data = BUILDING_DATA[buildingType];
    this.buildingType = buildingType;
    this.bdata = data;
    this.faction = faction;
    this.maxHp = data.hp;
    this.hp = 1; // starts at 1 HP during construction
    this.size = data.size;
    this.sight = data.sight || (data.size + 2);
    this.constructed = false;
    this.constructionProgress = 0; // 0..1
    this.rallyX = tx + data.size;
    this.rallyY = ty + data.size;

    // Training queue
    this.trainQueue = [];
    this.trainTimer = null;

    // Upgrade state
    this.upgrading = false;
    this.upgradeTimer = null;
    this.upgradeTarget = null;

    // Tower attack
    this.range = data.range || 0;
    this.basicDmg = data.basicDmg || 0;
    this.pierceDmg = data.pierceDmg || 0;
    this.splash = data.splash || 0;
    this.attackCooldown = 0;
    this.attackTarget = null;

    // Pixel center
    this.px = (tx + data.size / 2) * TILE;
    this.py = (ty + data.size / 2) * TILE;
  }

  get centerX() { return this.px; }
  get centerY() { return this.py; }

  get displayName() {
    const d = BUILDING_DATA[this.buildingType];
    return this.faction === FACTION.ORCS ? (d.nameorc || d.name) : d.name;
  }

  update(dt, game) {
    if (!this.alive || !this.constructed) return;

    // Training
    if (this.trainQueue.length > 0 && !this.trainTimer) {
      const unitType = this.trainQueue[0];
      const udata = UNIT_DATA[unitType];
      this.trainTimer = new GameTimer(udata.buildTime * TIME_SCALE, () => {
        this.trainQueue.shift();
        game.spawnUnit(unitType, this, this.playerId);
        this.trainTimer = null;
      });
    }
    if (this.trainTimer) this.trainTimer.update(dt);

    // Upgrading
    if (this.upgradeTimer) this.upgradeTimer.update(dt);

    // Tower auto-attack
    if (this.range > 0) {
      this.attackCooldown -= dt;
      if (this.attackCooldown <= 0) {
        const enemies = game.getEnemyUnitsInRange(this, this.range);
        if (enemies.length > 0) {
          game.dealDamage(this, enemies[0]);
          this.attackCooldown = 1.5;
        }
      }
    }
  }

  trainUnit(unitType, game) {
    const udata = UNIT_DATA[unitType];
    const player = game.getPlayer(this.playerId);
    const cost = udata.cost;
    if (!player.canAfford(cost)) { notify('Not enough resources!'); return false; }
    if (player.foodUsed >= player.foodMax) { notify('Need more farms!'); return false; }
    player.spend(cost);
    this.trainQueue.push(unitType);
    return true;
  }

  upgradeBuilding(targetType, game) {
    const tdata = BUILDING_DATA[targetType];
    const player = game.getPlayer(this.playerId);
    if (!player.canAfford(tdata.cost)) { notify('Not enough resources!'); return false; }
    player.spend(tdata.cost);
    this.upgrading = true;
    this.upgradeTarget = targetType;
    this.upgradeTimer = new GameTimer(tdata.buildTime * TIME_SCALE, () => {
      // Transform building
      this.buildingType = targetType;
      this.bdata = BUILDING_DATA[targetType];
      this.maxHp = this.bdata.hp;
      this.hp = this.bdata.hp;
      this.sight = this.bdata.sight || (this.bdata.size + 2);
      this.range = this.bdata.range || 0;
      this.basicDmg = this.bdata.basicDmg || 0;
      this.pierceDmg = this.bdata.pierceDmg || 0;
      this.upgrading = false;
      this.upgradeTarget = null;
      this.upgradeTimer = null;
      if (targetType === 'keep' || targetType === 'castle' || targetType === 'stronghold' || targetType === 'fortress') {
        player.techLevel = this.bdata.techLevel;
      }
      notify(this.displayName + ' upgraded!');
    });
    return true;
  }

  onDeath() {
    // Building destroyed
  }
}
