// ============================================================
// State - Central application state
// ============================================================

import { DEFAULT_GRID_SIZE, MAX_UNDO_STEPS } from './constants.js';

const state = {
  tool: 'draw',
  shape: 'tile',
  face: 'top',
  heightLevel: 0,
  layer: 0,
  rotation: 0,
  tileW: 32,
  tileH: 32,
  showGrid: true,
  gridSize: DEFAULT_GRID_SIZE,

  // Block dimensions
  blockW: 1,
  blockH: 1,
  blockD: 1,

  // Prism half
  prismHalf: 'left',

  // Tileset
  tilesetImage: null,
  tilesetTexture: null,
  tilesetCols: 0,
  tilesetRows: 0,
  selectedTile: null,
  tilesetZoom: 1.0,

  // Multi-tile selection
  selectedTiles: [],
  multiSelectMode: 'single',
  multiSelectStart: null,
  multiSelectDragging: false,

  // Map data
  mapTiles: {},
  tileMeshes: {},

  // Rect tool state
  rectStart: null,

  // Hover
  hoverPos: null,

  // Undo
  undoStack: [],
  maxUndoSteps: MAX_UNDO_STEPS,

  // Lighting
  userLights: [],
  nextLightId: 1,

  // Particles
  particleSystem: null,
  particleType: 'none',
};

export default state;
