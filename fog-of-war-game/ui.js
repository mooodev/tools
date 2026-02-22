// ============================================================
// UI.JS - HUD, action panels, build menus
// ============================================================

class UIManager {
  constructor(game) {
    this.game = game;
    this.topBar = document.getElementById('topBar');
    this.infoPanel = document.getElementById('infoPanel');
    this.actionPanel = document.getElementById('actionPanel');
    this.buildMenu = document.getElementById('buildMenu');
    this.portrait = document.getElementById('portrait');
    this.infoName = document.getElementById('infoName');
    this.infoHP = document.getElementById('infoHP');
    this.infoStats = document.getElementById('infoStats');
    this.notifDiv = document.getElementById('notifications');

    // Minimap click
    document.getElementById('minimap').addEventListener('click', e => this.onMinimapClick(e));
    document.getElementById('minimap').addEventListener('touchstart', e => {
      e.preventDefault(); e.stopPropagation();
      const rect = e.target.getBoundingClientRect();
      const t = e.touches[0];
      this.jumpToMinimap(t.clientX - rect.left, t.clientY - rect.top);
    });
  }

  onMinimapClick(e) {
    const rect = e.target.getBoundingClientRect();
    this.jumpToMinimap(e.clientX - rect.left, e.clientY - rect.top);
  }

  jumpToMinimap(mx, my) {
    const mw = this.game.renderer.miniCanvas.width;
    const mh = this.game.renderer.miniCanvas.height;
    const worldX = (mx / mw) * MAP_W * TILE;
    const worldY = (my / mh) * MAP_H * TILE;
    this.game.camera.centerOn(worldX, worldY);
  }

  updateResources() {
    const p = this.game.getPlayer(this.game.humanPlayerId);
    document.getElementById('resGold').textContent = Math.floor(p.gold);
    document.getElementById('resLumber').textContent = Math.floor(p.lumber);
    document.getElementById('resOil').textContent = Math.floor(p.oil);
    document.getElementById('resFood').textContent = p.foodUsed + '/' + p.foodMax;
  }

  updateSelection() {
    const selected = this.game.entities.filter(e => e.alive && e.selected);
    this.actionPanel.innerHTML = '';

    if (selected.length === 0) {
      this.portrait.style.background = '#333';
      this.infoName.textContent = '-';
      this.infoHP.textContent = '';
      this.infoStats.textContent = '';
      return;
    }

    const e = selected[0];
    const player = this.game.getPlayer(e.playerId);
    this.portrait.style.background = player.color;
    this.infoName.textContent = e.displayName || e.type;

    if (e instanceof Unit) {
      this.infoHP.textContent = `HP: ${Math.floor(e.hp)}/${e.maxHp}`;
      let stats = `ATK: ${e.basicDmg}+${e.pierceDmg} ARM: ${e.armor} RNG: ${e.range}`;
      if (e.hasMana) stats += ` MP: ${Math.floor(e.mana)}/${e.maxMana}`;
      if (e.isWorker && e.carryAmount > 0) stats += ` Carry: ${e.carryAmount} ${e.carryType}`;
      this.infoStats.textContent = stats;

      // Unit actions
      if (e.playerId === this.game.humanPlayerId) {
        if (e.isWorker) {
          this.addWorkerActions(e);
        } else {
          this.addUnitActions(e);
        }
      }
    } else if (e instanceof Building) {
      this.infoHP.textContent = `HP: ${Math.floor(e.hp)}/${e.maxHp}`;
      let stats = '';
      if (!e.constructed) stats = `Building: ${Math.floor(e.constructionProgress * 100)}%`;
      else if (e.upgrading) stats = `Upgrading: ${Math.floor(e.upgradeTimer.progress * 100)}%`;
      else if (e.trainQueue.length > 0) {
        const unitName = UNIT_DATA[e.trainQueue[0]];
        stats = `Training: ${unitName ? unitName.name : e.trainQueue[0]}`;
        if (e.trainTimer) stats += ` ${Math.floor(e.trainTimer.progress * 100)}%`;
      }
      if (e.range > 0) stats += ` RNG: ${e.range} DMG: ${e.basicDmg}+${e.pierceDmg}`;
      this.infoStats.textContent = stats;

      if (e.playerId === this.game.humanPlayerId && e.constructed) {
        this.addBuildingActions(e);
      }
    }
  }

  addWorkerActions(unit) {
    // Build button
    this.addActionBtn('Build', '#8B6914', () => this.showBuildMenu(unit));
    // Repair button
    this.addActionBtn('Repair', '#666', () => {
      notify('Select a building to repair');
    });
    // Stop
    this.addActionBtn('Stop', '#a00', () => {
      unit.path = []; unit.attackTarget = null; unit.workerState = 'idle';
    });
  }

  addUnitActions(unit) {
    // Attack-move
    this.addActionBtn('Attack', '#a00', () => {
      notify('Tap target to attack');
    });
    // Stop
    this.addActionBtn('Stop', '#a00', () => {
      unit.path = []; unit.attackTarget = null; unit.moving = false;
    });

    // Patrol could go here

    // Demo explode
    if (unit.isDemo) {
      this.addActionBtn('Detonate', '#f00', () => {
        this.game.demoExplode(unit);
      });
    }

    // Spells
    if (unit.hasMana) {
      const spells = SpellSystem.getAvailableSpells(unit);
      for (const spell of spells) {
        const canCast = unit.mana >= spell.mana;
        this.addActionBtn(spell.name, canCast ? '#639' : '#333', () => {
          if (!canCast) { notify('Not enough mana!'); return; }
          if (spell.target === 'self') {
            SpellSystem.cast(unit, spell.id, unit, this.game);
          } else {
            this.game.input.enterSpellMode(spell.id, unit);
          }
        }, !canCast);
      }
    }
  }

  addBuildingActions(building) {
    const bdata = building.bdata;

    // Train buttons
    if (bdata.trains) {
      const player = this.game.getPlayer(building.playerId);
      for (const unitType of bdata.trains) {
        const udata = UNIT_DATA[unitType];
        if (!udata) continue;
        const canTrain = player.canAfford(udata.cost) && player.meetsTrainReqs(unitType) && player.foodUsed < player.foodMax;
        const name = player.faction === FACTION.ORCS ? (udata.nameorc || udata.name) : udata.name;
        const costStr = this.formatCost(udata.cost);
        this.addActionBtn(name, canTrain ? '#3a5a3a' : '#333', () => {
          building.trainUnit(unitType, this.game);
          this.updateSelection();
        }, !canTrain, costStr);
      }
    }

    // Upgrade town hall
    if (bdata.upgrades) {
      const player = this.game.getPlayer(building.playerId);
      const target = bdata.upgrades;
      const tdata = BUILDING_DATA[target];
      if (tdata) {
        const canUpgrade = player.canAfford(tdata.cost) && !building.upgrading;
        const name = player.faction === FACTION.ORCS ? (tdata.nameorc || tdata.name) : tdata.name;
        this.addActionBtn('→ ' + name, canUpgrade ? '#5a3a0a' : '#333', () => {
          building.upgradeBuilding(target, this.game);
          this.updateSelection();
        }, !canUpgrade);
      }
    }

    // Tower upgrades
    if (building.buildingType === 'watchtower') {
      const player = this.game.getPlayer(building.playerId);
      const gData = BUILDING_DATA.guardtower;
      const cData = BUILDING_DATA.cannontower;
      if (gData) {
        const can = player.canAfford(gData.cost);
        this.addActionBtn('→ Guard', can ? '#5a5a5a' : '#333', () => {
          building.upgradeBuilding('guardtower', this.game);
          this.updateSelection();
        }, !can);
      }
      if (cData && player.techLevel >= 3) {
        const can = player.canAfford(cData.cost);
        this.addActionBtn('→ Cannon', can ? '#5a5a5a' : '#333', () => {
          building.upgradeBuilding('cannontower', this.game);
          this.updateSelection();
        }, !can);
      }
    }

    // Cancel training
    if (building.trainQueue.length > 0) {
      this.addActionBtn('Cancel', '#600', () => {
        const unitType = building.trainQueue.pop();
        if (unitType) {
          const udata = UNIT_DATA[unitType];
          const player = this.game.getPlayer(building.playerId);
          // Refund 75%
          if (udata.cost.g) player.gold += udata.cost.g * 0.75;
          if (udata.cost.l) player.lumber += udata.cost.l * 0.75;
          if (udata.cost.o) player.oil += udata.cost.o * 0.75;
        }
        if (building.trainQueue.length === 0) building.trainTimer = null;
        this.updateSelection();
      });
    }
  }

  addActionBtn(label, color, onClick, disabled = false, subtitle = '') {
    const btn = document.createElement('div');
    btn.className = 'action-btn' + (disabled ? ' disabled' : '');
    btn.innerHTML = `<div class="btn-icon" style="background:${color}"></div><span>${label}</span>` +
      (subtitle ? `<span style="font-size:7px;color:#aaa">${subtitle}</span>` : '');
    btn.addEventListener('click', e => { e.stopPropagation(); if (!disabled) onClick(); });
    btn.addEventListener('touchstart', e => { e.stopPropagation(); });
    this.actionPanel.appendChild(btn);
  }

  showBuildMenu(worker) {
    const menu = this.buildMenu;
    const player = this.game.getPlayer(this.game.humanPlayerId);
    menu.innerHTML = '<div style="color:#FFD700;font-size:13px;margin-bottom:6px;font-weight:bold">Build</div>';

    for (const bt of BUILDABLE) {
      const bdata = BUILDING_DATA[bt];
      if (!player.meetsBuildReqs(bt)) continue;

      const canAfford = player.canAfford(bdata.cost);
      const name = player.faction === FACTION.ORCS ? (bdata.nameorc || bdata.name) : bdata.name;
      const costStr = this.formatCost(bdata.cost);

      const item = document.createElement('div');
      item.className = 'build-item' + (canAfford ? '' : ' cant-afford');
      item.innerHTML = `
        <div class="build-icon" style="background:${BUILDING_COLORS[bt] || '#666'}"></div>
        <div><div>${name}</div><div class="build-cost">${costStr}</div></div>
      `;
      item.addEventListener('click', e => {
        e.stopPropagation();
        if (canAfford) {
          this.game.input.enterPlacementMode(bt);
        } else {
          notify('Not enough resources!');
        }
      });
      item.addEventListener('touchstart', e => e.stopPropagation());
      menu.appendChild(item);
    }

    // Close button
    const closeBtn = document.createElement('div');
    closeBtn.className = 'build-item';
    closeBtn.innerHTML = '<div style="color:#f66">Close</div>';
    closeBtn.addEventListener('click', () => { menu.style.display = 'none'; });
    closeBtn.addEventListener('touchstart', e => e.stopPropagation());
    menu.appendChild(closeBtn);

    menu.style.display = 'block';
  }

  formatCost(cost) {
    const parts = [];
    if (cost.g) parts.push(cost.g + 'g');
    if (cost.l) parts.push(cost.l + 'l');
    if (cost.o) parts.push(cost.o + 'o');
    return parts.join(' ');
  }

  updateNotifications() {
    const now = Date.now();
    // Remove expired
    while (notifications.length > 0 && now - notifications[0].time > notifications[0].duration) {
      notifications.shift();
    }
    // Show recent (max 5)
    const recent = notifications.slice(-5);
    this.notifDiv.innerHTML = '';
    for (const n of recent) {
      const div = document.createElement('div');
      div.className = 'notif';
      div.textContent = n.text;
      this.notifDiv.appendChild(div);
    }
  }
}
