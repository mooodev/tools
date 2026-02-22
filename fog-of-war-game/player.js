// ============================================================
// PLAYER.JS - Player state, resources, upgrades
// ============================================================

class Player {
  constructor(id, faction, isAI = false) {
    this.id = id;
    this.faction = faction;
    this.isAI = isAI;
    this.gold = 600;
    this.lumber = 300;
    this.oil = 0;
    this.techLevel = 1; // 1=TownHall, 2=Keep, 3=Castle
    this.color = faction === FACTION.HUMANS ? '#3366FF' : '#FF3333';
    this.colorLight = faction === FACTION.HUMANS ? '#6699FF' : '#FF6666';
    this.colorDark = faction === FACTION.HUMANS ? '#1133AA' : '#AA1111';
    this.upgrades = {}; // upgradeId -> true
    this.score = { unitsKilled: 0, buildingsDestroyed: 0, resourcesGathered: 0 };
  }

  get foodUsed() {
    if (!window.game) return 0;
    return window.game.entities.filter(e => e.alive && e.playerId === this.id && e instanceof Unit).length;
  }

  get foodMax() {
    if (!window.game) return 0;
    let food = 0;
    window.game.entities.forEach(e => {
      if (e.alive && e.playerId === this.id && e instanceof Building && e.constructed && e.bdata.provides && e.bdata.provides.food) {
        food += e.bdata.provides.food;
      }
    });
    return food;
  }

  canAfford(cost) {
    if (cost.g && this.gold < cost.g) return false;
    if (cost.l && this.lumber < cost.l) return false;
    if (cost.o && this.oil < cost.o) return false;
    return true;
  }

  spend(cost) {
    if (cost.g) this.gold -= cost.g;
    if (cost.l) this.lumber -= cost.l;
    if (cost.o) this.oil -= cost.o;
  }

  hasBuilding(buildingType) {
    if (!window.game) return false;
    return window.game.entities.some(e =>
      e.alive && e.playerId === this.id && e instanceof Building &&
      e.constructed && e.buildingType === buildingType
    );
  }

  hasUpgrade(upgradeId) {
    return !!this.upgrades[upgradeId];
  }

  meetsTrainReqs(unitType) {
    const reqs = TRAIN_REQS[unitType];
    if (!reqs) return true;
    if (reqs.techLevel && this.techLevel < reqs.techLevel) return false;
    if (reqs.buildings) {
      for (const b of reqs.buildings) {
        if (!this.hasBuilding(b)) return false;
      }
    }
    return true;
  }

  meetsBuildReqs(buildingType) {
    const reqs = BUILDING_REQS[buildingType];
    if (!reqs) return true;
    if (reqs.techLevel && this.techLevel < reqs.techLevel) return false;
    return true;
  }

  getUpgradeBonus(stat) {
    let bonus = 0;
    for (const uid in this.upgrades) {
      const u = UPGRADE_DATA[uid];
      if (u && u.effect[stat]) bonus += u.effect[stat];
    }
    return bonus;
  }
}
