// ============================================================
// SPELLS.JS - Spell system for casters
// ============================================================

class SpellSystem {
  static getAvailableSpells(unit) {
    if (!unit.hasMana) return [];
    const faction = unit.faction;
    const spells = [];
    for (const sid in SPELL_DATA) {
      const s = SPELL_DATA[sid];
      if (s.faction === faction && s.caster.includes(unit.unitType)) {
        spells.push({ id: sid, ...s });
      }
    }
    return spells;
  }

  static canCast(unit, spellId) {
    const s = SPELL_DATA[spellId];
    if (!s) return false;
    return unit.mana >= s.mana;
  }

  static cast(caster, spellId, target, game) {
    const s = SPELL_DATA[spellId];
    if (!s || caster.mana < s.mana) return false;

    caster.mana -= s.mana;

    switch (s.type) {
      case 'heal':
        if (target && target.alive && target.playerId === caster.playerId) {
          target.heal(s.value);
          game.addEffect({ type: 'heal', x: target.centerX, y: target.centerY, timer: 0.5 });
          notify(s.name + '!');
        }
        break;

      case 'aoe_damage':
        game.dealAoEMagicDamage(target.tx || target.x, target.ty || target.y, s.radius, s.value, caster.playerId);
        game.addEffect({
          type: 'explosion', x: (target.tx || target.x) * TILE + TILE / 2,
          y: (target.ty || target.y) * TILE + TILE / 2, timer: 0.6, radius: s.radius
        });
        notify(s.name + '!');
        break;

      case 'aoe_dot':
        // Create persistent AoE zone
        const tx = target.tx !== undefined ? target.tx : target.x;
        const ty = target.ty !== undefined ? target.ty : target.y;
        game.aoeZones.push({
          x: tx, y: ty, radius: s.radius, dmgPerTick: s.value,
          ticksLeft: s.ticks, tickTimer: 0, tickInterval: 0.5,
          casterPlayerId: caster.playerId, spellName: s.name
        });
        notify(s.name + '!');
        break;

      case 'polymorph':
        if (target && target.alive && target instanceof Unit && target.playerId !== caster.playerId) {
          target.polymorphed = true;
          target.basicDmg = 0;
          target.pierceDmg = 0;
          target.armor = 0;
          target.maxHp = 1;
          target.hp = 1;
          target.path = [];
          target.attackTarget = null;
          game.addEffect({ type: 'polymorph', x: target.centerX, y: target.centerY, timer: 0.5 });
          notify('Polymorph!');
        }
        break;

      case 'debuff':
        if (target && target.alive && target.playerId !== caster.playerId) {
          target.addBuff(s.effect, s.duration / FPS);
          game.addEffect({ type: 'debuff', x: target.centerX, y: target.centerY, timer: 0.4 });
          notify(s.name + '!');
        }
        break;

      case 'buff':
        if (target && target.alive && target.playerId === caster.playerId) {
          target.addBuff(s.effect, s.duration / FPS);
          game.addEffect({ type: 'buff', x: target.centerX, y: target.centerY, timer: 0.4 });
          notify(s.name + '!');
        }
        break;

      case 'drain':
        // Death Coil: damage enemy, heal self
        if (target && target.alive && target.playerId !== caster.playerId) {
          game.dealMagicDamage(target, s.value);
          caster.heal(Math.floor(s.value / 2));
          notify(s.name + '!');
        }
        break;

      case 'summon':
        const sdata = SUMMON_DATA[s.summon];
        if (sdata) {
          const count = s.count || 1;
          for (let i = 0; i < count; i++) {
            const sx = caster.tx + randInt(-2, 2);
            const sy = caster.ty + randInt(-2, 2);
            const summon = new Unit(s.summon + '_summon', sx, sy, caster.playerId, caster.faction);
            // Override stats from summon data
            summon.hp = sdata.hp; summon.maxHp = sdata.hp;
            summon.armor = sdata.armor; summon.basicDmg = sdata.basicDmg;
            summon.pierceDmg = sdata.pierceDmg; summon.range = sdata.range;
            summon.baseSpeed = sdata.speed; summon.sight = sdata.sight;
            summon.moveType = sdata.type; summon.duration = sdata.duration;
            summon.isScout = !!sdata.isScout;
            summon.unitType = s.summon;
            game.entities.push(summon);
            if (sdata.type !== 'air') game.map.occupy(sx, sy, summon.id);
          }
          notify(s.name + '!');
        }
        break;
    }

    return true;
  }
}

// AoE zone update
function updateAoEZones(game, dt) {
  for (let i = game.aoeZones.length - 1; i >= 0; i--) {
    const z = game.aoeZones[i];
    z.tickTimer += dt;
    if (z.tickTimer >= z.tickInterval) {
      z.tickTimer = 0;
      z.ticksLeft--;
      game.dealAoEMagicDamage(z.x, z.y, z.radius, z.dmgPerTick, z.casterPlayerId);
      game.addEffect({
        type: 'aoe_zone', x: z.x * TILE + TILE / 2, y: z.y * TILE + TILE / 2,
        timer: 0.3, radius: z.radius
      });
    }
    if (z.ticksLeft <= 0) game.aoeZones.splice(i, 1);
  }
}
