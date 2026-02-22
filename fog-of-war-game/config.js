// ============================================================
// CONFIG.JS - All game constants, unit/building/spell data
// ============================================================

const TILE = 32;
const MAP_W = 64;
const MAP_H = 64;
const FPS = 30;
const TICK = 1000 / FPS;

// Terrain types
const T = { GRASS: 0, WATER: 1, FOREST: 2, GOLD: 3, OIL: 4, DIRT: 5, WALL_TILE: 6, COAST: 7 };

// Terrain colors
const TERRAIN_COLORS = {
  [T.GRASS]: '#3a7a2a', [T.WATER]: '#1a4a8a', [T.FOREST]: '#1a5a1a',
  [T.GOLD]: '#8B7500', [T.OIL]: '#1a3a6a', [T.DIRT]: '#8B7355',
  [T.WALL_TILE]: '#888', [T.COAST]: '#5a9a4a'
};

// Factions
const FACTION = { HUMANS: 'humans', ORCS: 'orcs' };

// Game speed multiplier (lower = faster build/train times for playability)
const TIME_SCALE = 0.33;

// Gold carry amounts per town hall level
const GOLD_CARRY = { 1: 100, 2: 110, 3: 125 };

// ============================================================
// UNIT DATA
// ============================================================
const UNIT_DATA = {
  // Workers
  peasant:      { name: 'Peasant',     nameorc: 'Peon',        hp: 30,  cost: {g:400}, armor: 0, basicDmg: 3, workerDmg: 3, workerArmor: 0, workerRange: 1, pierceDmg: 2, range: 1, speed: 2.0, sight: 4, buildTime: 45, isWorker: true, size: 1, type: 'ground' },
  // Melee
  footman:      { name: 'Footman',     nameorc: 'Grunt',       hp: 60,  cost: {g:600}, armor: 2, basicDmg: 6, pierceDmg: 3, range: 1, speed: 2.0, sight: 4, buildTime: 60, size: 1, type: 'ground', trainAt: 'barracks' },
  // Ranged
  archer:       { name: 'Archer',      nameorc: 'Axethrower',  hp: 40,  cost: {g:500, l:50}, armor: 0, basicDmg: 3, pierceDmg: 6, range: 4, speed: 2.0, sight: 5, buildTime: 70, size: 1, type: 'ground', trainAt: 'barracks' },
  ranger:       { name: 'Ranger',      nameorc: 'Berserker',   hp: 50,  cost: {g:500, l:50}, armor: 0, basicDmg: 3, pierceDmg: 6, range: 4, speed: 2.0, sight: 6, buildTime: 70, size: 1, type: 'ground', trainAt: 'barracks', requires: 'lumbermill', techLevel: 2 },
  // Cavalry
  knight:       { name: 'Knight',      nameorc: 'Ogre',        hp: 90,  cost: {g:800, l:100}, armor: 4, basicDmg: 8, pierceDmg: 4, range: 1, speed: 2.6, sight: 4, buildTime: 90, size: 1, type: 'ground', trainAt: 'barracks', requires: 'stables', techLevel: 2 },
  paladin:      { name: 'Paladin',     nameorc: 'Ogre-Mage',   hp: 90,  cost: {g:800, l:100}, armor: 4, basicDmg: 8, pierceDmg: 4, range: 1, speed: 2.6, sight: 5, buildTime: 90, size: 1, type: 'ground', trainAt: 'barracks', requires: 'church', techLevel: 3, mana: 255, hasMana: true },
  // Siege
  ballista:     { name: 'Ballista',    nameorc: 'Catapult',    hp: 110, cost: {g:900, l:300}, armor: 0, basicDmg: 80, pierceDmg: 0, range: 8, speed: 1.0, sight: 9, buildTime: 250, size: 1, type: 'ground', trainAt: 'barracks', requires: 'blacksmith', isSiege: true, splash: 2 },
  // Demolition
  demolition:   { name: 'Demolition',  nameorc: 'Sappers',     hp: 40,  cost: {g:750, l:250}, armor: 0, basicDmg: 4, pierceDmg: 2, range: 1, speed: 2.2, sight: 4, buildTime: 200, size: 1, type: 'ground', trainAt: 'barracks', requires: 'blacksmith', techLevel: 3, isDemo: true, demoDmg: 400, demoRadius: 3 },
  // Casters
  mage:         { name: 'Mage',        nameorc: 'Death Knight', hp: 60, cost: {g:1200}, armor: 0, basicDmg: 0, pierceDmg: 9, range: 3, speed: 1.6, sight: 9, buildTime: 120, size: 1, type: 'ground', trainAt: 'magetower', techLevel: 3, mana: 255, hasMana: true, isCaster: true },
  // Air scout
  flyingmachine:{ name: 'Flying Machine', nameorc: 'Zeppelin',  hp: 150, cost: {g:500, l:100}, armor: 2, basicDmg: 0, pierceDmg: 0, range: 0, speed: 3.4, sight: 9, buildTime: 65, size: 1, type: 'air', trainAt: 'gryphon', isScout: true, detectInvisible: true },
  // Air attack
  gryphon:      { name: 'Gryphon',     nameorc: 'Dragon',      hp: 100, cost: {g:2500}, armor: 5, basicDmg: 0, pierceDmg: 16, range: 4, speed: 2.8, sight: 6, buildTime: 250, size: 1, type: 'air', trainAt: 'gryphon', techLevel: 3 },
  // Naval
  tanker:       { name: 'Oil Tanker',  nameorc: 'Oil Tanker',  hp: 90,  cost: {g:400, l:250}, armor: 0, basicDmg: 0, pierceDmg: 0, range: 0, speed: 2.0, sight: 4, buildTime: 50, size: 1, type: 'naval', trainAt: 'shipyard', isOilWorker: true },
  transport:    { name: 'Transport',   nameorc: 'Transport',   hp: 150, cost: {g:600, l:200, o:500}, armor: 0, basicDmg: 0, pierceDmg: 0, range: 0, speed: 2.0, sight: 4, buildTime: 70, size: 1, type: 'naval', trainAt: 'shipyard', capacity: 6, techLevel: 2 },
  destroyer:    { name: 'Destroyer',   nameorc: 'Destroyer',   hp: 100, cost: {g:700, l:350, o:700}, armor: 10, basicDmg: 35, pierceDmg: 0, range: 4, speed: 2.0, sight: 8, buildTime: 90, size: 1, type: 'naval', trainAt: 'shipyard', techLevel: 2 },
  battleship:   { name: 'Battleship',  nameorc: 'Juggernaught',hp: 150, cost: {g:1000, l:500, o:1000}, armor: 15, basicDmg: 130, pierceDmg: 0, range: 6, speed: 1.2, sight: 8, buildTime: 140, size: 1, type: 'naval', trainAt: 'shipyard', techLevel: 3, isSiege: true, splash: 2 },
  submarine:    { name: 'Submarine',   nameorc: 'Turtle',      hp: 60,  cost: {g:800, l:150, o:800}, armor: 0, basicDmg: 50, pierceDmg: 0, range: 5, speed: 1.4, sight: 5, buildTime: 100, size: 1, type: 'naval', trainAt: 'shipyard', techLevel: 3, isStealthy: true }
};

// Unit visual colors (placeholder)
const UNIT_COLORS = {
  peasant: '#C4A882', footman: '#A0A0B0', archer: '#5A8A3A', ranger: '#3A7A2A',
  knight: '#E0E0F0', paladin: '#FFD700', ballista: '#8B6914', demolition: '#FF4444',
  mage: '#9966FF', flyingmachine: '#B0B0B0', gryphon: '#FFD700',
  tanker: '#666', transport: '#888', destroyer: '#556', battleship: '#445',
  submarine: '#335'
};

// ============================================================
// BUILDING DATA
// ============================================================
const BUILDING_DATA = {
  townhall:    { name: 'Town Hall',    nameorc: 'Great Hall',   hp: 1200, cost: {g:1200, l:800}, size: 4, buildTime: 200, provides: {food: 1}, trains: ['peasant'], techLevel: 1, upgrades: 'keep' },
  keep:        { name: 'Keep',         nameorc: 'Stronghold',   hp: 1400, cost: {g:2000, l:1000, o:200}, size: 4, buildTime: 200, provides: {food: 1}, trains: ['peasant'], techLevel: 2, upgrades: 'castle', upgradeFrom: 'townhall' },
  castle:      { name: 'Castle',       nameorc: 'Fortress',     hp: 1600, cost: {g:2500, l:1200, o:500}, size: 4, buildTime: 200, provides: {food: 2}, trains: ['peasant'], techLevel: 3, upgradeFrom: 'keep' },
  farm:        { name: 'Farm',         nameorc: 'Pig Farm',     hp: 400,  cost: {g:500, l:250}, size: 2, buildTime: 100, provides: {food: 4} },
  barracks:    { name: 'Barracks',     nameorc: 'Barracks',     hp: 800,  cost: {g:700, l:450}, size: 3, buildTime: 150, trains: ['footman', 'archer', 'ranger', 'knight', 'paladin', 'ballista', 'demolition'] },
  lumbermill:  { name: 'Lumber Mill',  nameorc: 'Lumber Mill',  hp: 600,  cost: {g:600, l:450}, size: 3, buildTime: 150, providesUpgrade: true },
  blacksmith:  { name: 'Blacksmith',   nameorc: 'Blacksmith',   hp: 775,  cost: {g:800, l:450, o:100}, size: 3, buildTime: 150, providesUpgrade: true },
  stables:     { name: 'Stables',      nameorc: 'Ogre Mound',   hp: 500,  cost: {g:1000, l:300}, size: 3, buildTime: 150, techLevel: 2 },
  church:      { name: 'Church',       nameorc: 'Temple',       hp: 700,  cost: {g:900, l:500}, size: 3, buildTime: 175, techLevel: 2 },
  magetower:   { name: 'Mage Tower',   nameorc: 'Temple of Damned', hp: 500, cost: {g:1000, l:200}, size: 3, buildTime: 175, trains: ['mage'], techLevel: 3 },
  gryphon:     { name: 'Gryphon Aviary', nameorc: 'Dragon Roost', hp: 500, cost: {g:1000, l:400}, size: 3, buildTime: 175, trains: ['flyingmachine', 'gryphon'], techLevel: 3 },
  shipyard:    { name: 'Shipyard',     nameorc: 'Shipyard',     hp: 1100, cost: {g:800, l:450}, size: 3, buildTime: 150, trains: ['tanker', 'transport', 'destroyer', 'battleship', 'submarine'], needsCoast: true },
  refinery:    { name: 'Oil Refinery', nameorc: 'Oil Refinery', hp: 600,  cost: {g:800, l:350, o:200}, size: 3, buildTime: 175, needsCoast: true },
  foundry:     { name: 'Foundry',      nameorc: 'Foundry',      hp: 750,  cost: {g:700, l:400, o:400}, size: 3, buildTime: 175 },
  watchtower:  { name: 'Watch Tower',  nameorc: 'Watch Tower',  hp: 100,  cost: {g:550, l:200}, size: 2, buildTime: 100, sight: 9 },
  guardtower:  { name: 'Guard Tower',  nameorc: 'Guard Tower',  hp: 130,  cost: {g:500, l:150}, size: 2, buildTime: 80, range: 6, basicDmg: 4, pierceDmg: 12, sight: 9, upgradeFrom: 'watchtower' },
  cannontower: { name: 'Cannon Tower', nameorc: 'Cannon Tower', hp: 160,  cost: {g:1000, l:300}, size: 2, buildTime: 100, range: 7, basicDmg: 50, pierceDmg: 0, sight: 9, splash: 1, upgradeFrom: 'watchtower', techLevel: 3 },
  wall:        { name: 'Wall',         nameorc: 'Wall',         hp: 40,   cost: {g:20, l:10}, size: 1, buildTime: 15 }
};

// Building colors
const BUILDING_COLORS = {
  townhall: '#8B6914', keep: '#9B7924', castle: '#AB8934',
  farm: '#6B8E23', barracks: '#8B4513', lumbermill: '#556B2F',
  blacksmith: '#708090', stables: '#A0522D', church: '#DAA520',
  magetower: '#663399', gryphon: '#B8860B', shipyard: '#4682B4',
  refinery: '#2F4F4F', foundry: '#696969', watchtower: '#A0A0A0',
  guardtower: '#808080', cannontower: '#606060', wall: '#808080'
};

// Buildable by workers (in build menu)
const BUILDABLE = ['farm', 'barracks', 'lumbermill', 'blacksmith', 'stables', 'church', 'magetower', 'gryphon', 'watchtower', 'wall', 'shipyard', 'refinery', 'foundry'];

// Tech requirements for buildings
const BUILDING_REQS = {
  farm: {}, barracks: {}, lumbermill: {}, blacksmith: { techLevel: 2 },
  stables: { techLevel: 2 }, church: { techLevel: 2 }, magetower: { techLevel: 3 },
  gryphon: { techLevel: 3 }, watchtower: {}, wall: {},
  shipyard: { needsCoast: true }, refinery: { needsCoast: true, techLevel: 2 },
  foundry: { techLevel: 2 }
};

// Unit train requirements
const TRAIN_REQS = {
  peasant: {}, footman: {}, archer: {},
  ranger: { buildings: ['lumbermill'], techLevel: 2 },
  knight: { buildings: ['stables'], techLevel: 2 },
  paladin: { buildings: ['church', 'stables'], techLevel: 3 },
  ballista: { buildings: ['blacksmith'], techLevel: 2 },
  demolition: { buildings: ['blacksmith'], techLevel: 3 },
  mage: { techLevel: 3 },
  flyingmachine: { techLevel: 2 }, gryphon: { techLevel: 3 },
  tanker: {}, transport: { techLevel: 2 },
  destroyer: { techLevel: 2 }, battleship: { techLevel: 3 },
  submarine: { techLevel: 3 }
};

// ============================================================
// SPELL DATA
// ============================================================
const SPELL_DATA = {
  // Human spells
  holylight:   { name: 'Holy Light',   mana: 25,  range: 6, faction: 'humans', caster: ['paladin'], type: 'heal', value: 50, target: 'friendly' },
  fireball:    { name: 'Fireball',     mana: 50,  range: 8, faction: 'humans', caster: ['mage'], type: 'aoe_damage', value: 40, radius: 2, target: 'point' },
  blizzard:    { name: 'Blizzard',     mana: 75,  range: 8, faction: 'humans', caster: ['mage'], type: 'aoe_dot', value: 10, ticks: 8, radius: 3, target: 'point' },
  polymorph:   { name: 'Polymorph',    mana: 100, range: 6, faction: 'humans', caster: ['mage'], type: 'polymorph', target: 'enemy' },
  slow:        { name: 'Slow',         mana: 50,  range: 8, faction: 'humans', caster: ['mage'], type: 'debuff', effect: 'slow', duration: 600, target: 'enemy' },
  invisibility:{ name: 'Invisibility', mana: 75,  range: 6, faction: 'humans', caster: ['mage'], type: 'buff', effect: 'invisible', duration: 600, target: 'friendly' },
  // Orc spells
  deathcoil:   { name: 'Death Coil',   mana: 25,  range: 8, faction: 'orcs', caster: ['mage'], type: 'drain', value: 50, target: 'enemy' },
  deathdecay:  { name: 'Death & Decay',mana: 75,  range: 8, faction: 'orcs', caster: ['mage'], type: 'aoe_dot', value: 12, ticks: 8, radius: 3, target: 'point' },
  raisedead:   { name: 'Raise Dead',   mana: 50,  range: 6, faction: 'orcs', caster: ['mage'], type: 'summon', summon: 'skeleton', count: 2, target: 'point' },
  haste:       { name: 'Haste',        mana: 50,  range: 6, faction: 'orcs', caster: ['mage'], type: 'buff', effect: 'haste', duration: 600, target: 'friendly' },
  bloodlust:   { name: 'Bloodlust',    mana: 50,  range: 6, faction: 'orcs', caster: ['paladin'], type: 'buff', effect: 'bloodlust', duration: 600, target: 'friendly' },
  eyeofkilrogg:{ name: 'Eye of Kilrogg', mana: 25, range: 0, faction: 'orcs', caster: ['mage'], type: 'summon', summon: 'eye', target: 'self' }
};

// Summonable unit data
const SUMMON_DATA = {
  skeleton: { name: 'Skeleton', hp: 40, armor: 0, basicDmg: 6, pierceDmg: 1, range: 1, speed: 1.5, sight: 3, size: 1, type: 'ground', duration: 900 },
  eye:      { name: 'Eye of Kilrogg', hp: 100, armor: 0, basicDmg: 0, pierceDmg: 0, range: 0, speed: 3.0, sight: 6, size: 1, type: 'air', duration: 450, isScout: true }
};

// Upgrade data
const UPGRADE_DATA = {
  weapons1:  { name: 'Weapons +1', cost: {g:500, l:100}, time: 150, building: 'blacksmith', effect: {pierceDmg: 2}, level: 1 },
  weapons2:  { name: 'Weapons +2', cost: {g:750, l:200}, time: 175, building: 'blacksmith', effect: {pierceDmg: 2}, level: 2, requires: 'weapons1' },
  armor1:    { name: 'Armor +1',   cost: {g:500, l:100}, time: 150, building: 'blacksmith', effect: {armor: 2}, level: 1 },
  armor2:    { name: 'Armor +2',   cost: {g:750, l:200}, time: 175, building: 'blacksmith', effect: {armor: 2}, level: 2, requires: 'armor1' },
  arrows1:   { name: 'Arrows +1',  cost: {g:300, l:300}, time: 150, building: 'lumbermill', effect: {pierceDmg: 1, rangedOnly: true}, level: 1 },
  arrows2:   { name: 'Arrows +2',  cost: {g:600, l:300}, time: 175, building: 'lumbermill', effect: {pierceDmg: 1, rangedOnly: true}, level: 2, requires: 'arrows1' }
};
