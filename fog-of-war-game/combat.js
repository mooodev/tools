// ============================================================
// COMBAT.JS - Damage formula, attacks, siege, demolition
// ============================================================

class CombatSystem {
  // Warcraft 2 damage formula:
  // (Random(50%..100%) × BasicDamage − TargetArmor [min 0]) + PiercingDamage
  // Magic damage ignores armor completely

  static calculateDamage(attacker, target, game) {
    const player = game.getPlayer(attacker.playerId);
    let basic, pierce;

    if (attacker instanceof Unit) {
      const eff = attacker.effectiveDmg;
      basic = eff.basic;
      pierce = eff.pierce;
      // Add upgrade bonuses
      pierce += player.getUpgradeBonus('pierceDmg');
    } else {
      // Building (tower)
      basic = attacker.basicDmg;
      pierce = attacker.pierceDmg;
    }

    let targetArmor = 0;
    if (target instanceof Unit) {
      targetArmor = target.armor;
      const tp = game.getPlayer(target.playerId);
      targetArmor += tp.getUpgradeBonus('armor');
    }

    // Random factor on basic damage: 50% to 100%
    const randomFactor = randFloat(0.5, 1.0);
    const basicDmg = Math.max(0, Math.floor(randomFactor * basic) - targetArmor);
    const totalDmg = basicDmg + pierce;

    return Math.max(1, totalDmg);
  }

  static calculateMagicDamage(value) {
    // Magic ignores armor
    return value;
  }
}

// Extend game with combat methods
function initCombat(game) {
  game.dealDamage = function(attacker, target) {
    if (!target.alive) return;
    const dmg = CombatSystem.calculateDamage(attacker, target, game);

    // Splash damage for siege units
    if (attacker.splash && attacker.splash > 0) {
      game.dealSplashDamage(target.tx, target.ty, attacker.splash, dmg, attacker.playerId);
    } else {
      target.takeDamage(dmg);
    }

    if (!target.alive) {
      const player = game.getPlayer(attacker.playerId);
      if (target instanceof Unit) player.score.unitsKilled++;
      if (target instanceof Building) player.score.buildingsDestroyed++;
    }

    // Visual feedback
    game.addEffect({ type: 'hit', x: target.centerX, y: target.centerY, timer: 0.3 });

    // Ranged attack projectile visual
    if (attacker.range > 1 || (attacker instanceof Building && attacker.range > 0)) {
      game.addEffect({
        type: 'projectile',
        x1: attacker.centerX, y1: attacker.centerY,
        x2: target.centerX, y2: target.centerY,
        timer: 0.2
      });
    }
  };

  game.dealSplashDamage = function(cx, cy, radius, dmg, attackerPlayerId) {
    const r2 = radius * radius;
    for (const e of game.entities) {
      if (!e.alive) continue;
      const dx = e.tx - cx, dy = e.ty - cy;
      if (dx * dx + dy * dy <= r2) {
        // Splash hits everyone including friendlies (siege)
        const splashDmg = Math.floor(dmg * (1 - (dx * dx + dy * dy) / (r2 + 1)));
        e.takeDamage(Math.max(1, splashDmg));
        game.addEffect({ type: 'hit', x: e.centerX, y: e.centerY, timer: 0.2 });
      }
    }
  };

  game.demoExplode = function(unit) {
    game.addEffect({
      type: 'explosion', x: unit.centerX, y: unit.centerY, timer: 0.6, radius: unit.isDemo ? 3 : 2
    });

    const dmg = UNIT_DATA[unit.unitType].demoDmg || 400;
    const radius = UNIT_DATA[unit.unitType].demoRadius || 3;
    game.dealSplashDamage(unit.tx, unit.ty, radius, dmg, unit.playerId);
    unit.alive = false;
  };

  game.dealMagicDamage = function(target, amount) {
    if (!target.alive) return;
    target.takeDamage(CombatSystem.calculateMagicDamage(amount));
    game.addEffect({ type: 'magic_hit', x: target.centerX, y: target.centerY, timer: 0.4 });
  };

  game.dealAoEMagicDamage = function(cx, cy, radius, amount, casterPlayerId) {
    for (const e of game.entities) {
      if (!e.alive || e.playerId === casterPlayerId) continue;
      const dx = (e.tx - cx), dy = (e.ty - cy);
      if (dx * dx + dy * dy <= radius * radius) {
        e.takeDamage(CombatSystem.calculateMagicDamage(amount));
      }
    }
  };

  game.addEffect = function(effect) {
    game.effects.push(effect);
  };
}
