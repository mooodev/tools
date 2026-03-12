// ============================================================
// Toolbar - Toolbar button handlers, shape/face/height/layer
// ============================================================

import state from './state.js';
import { TILE_WORLD_SIZE } from './constants.js';
import { createGround } from './renderer.js';
import { rebuildGrid, getGridHelper } from './grid.js';
import { updateRaycastPlanes } from './input.js';
import { removeTileMesh, updateTileCount } from './tiles.js';

const toolBtns = {
  draw: document.getElementById('btn-draw'),
  erase: document.getElementById('btn-erase'),
  rect: document.getElementById('btn-rect'),
};

function setTool(tool) {
  state.tool = tool;
  Object.keys(toolBtns).forEach(t => toolBtns[t].classList.toggle('active', t === tool));
}

function initToolbar() {
  toolBtns.draw.addEventListener('click', () => setTool('draw'));
  toolBtns.erase.addEventListener('click', () => setTool('erase'));
  toolBtns.rect.addEventListener('click', () => setTool('rect'));

  // Shape selection
  const shapeSelect = document.getElementById('shape-select');
  const blockSizeRow = document.getElementById('block-size-row');

  function updateShapeUI() {
    blockSizeRow.style.display = state.shape === 'block' ? 'flex' : 'none';
    document.getElementById('prism-dir-row').style.display = 'none';
  }

  shapeSelect.addEventListener('change', e => {
    state.shape = e.target.value;
    updateShapeUI();
  });

  document.getElementById('block-w').addEventListener('change', e => {
    state.blockW = Math.max(1, Math.min(10, parseInt(e.target.value) || 1));
  });
  document.getElementById('block-h').addEventListener('change', e => {
    state.blockH = Math.max(1, Math.min(10, parseInt(e.target.value) || 1));
  });
  document.getElementById('block-d').addEventListener('change', e => {
    state.blockD = Math.max(1, Math.min(10, parseInt(e.target.value) || 1));
  });
  document.getElementById('prism-half').addEventListener('change', e => {
    state.prismHalf = e.target.value;
  });

  document.getElementById('rotation-select').addEventListener('change', e => {
    state.rotation = parseInt(e.target.value);
  });

  document.getElementById('face-select').addEventListener('change', e => {
    state.face = e.target.value;
    updateRaycastPlanes();
  });

  // Height slider
  const heightSlider = document.getElementById('height-slider-tb');
  const heightVal = document.getElementById('height-val');
  heightSlider.addEventListener('input', () => {
    state.heightLevel = parseInt(heightSlider.value);
    heightVal.textContent = state.heightLevel;
    updateRaycastPlanes();
    const gh = getGridHelper();
    if (gh) gh.position.y = state.heightLevel * TILE_WORLD_SIZE;
  });

  // Grid toggle
  document.getElementById('btn-grid').addEventListener('click', () => {
    state.showGrid = !state.showGrid;
    const gh = getGridHelper();
    if (gh) gh.visible = state.showGrid;
    document.getElementById('btn-grid').classList.toggle('active', state.showGrid);
  });

  // Undo
  const { performUndo } = require_undo();
  document.getElementById('btn-undo').addEventListener('click', () => performUndo());

  // Layer
  document.getElementById('layer-select').addEventListener('change', e => {
    state.layer = parseInt(e.target.value);
  });

  // Clear
  document.getElementById('btn-clear').addEventListener('click', () => {
    if (!confirm('Clear all tiles?')) return;
    Object.keys(state.tileMeshes).forEach(removeTileMesh);
    state.mapTiles = {};
    updateTileCount();
  });

  // Map size
  const gridSizeInput = document.getElementById('grid-size-input');
  if (gridSizeInput) {
    gridSizeInput.value = state.gridSize;

    function applyGridSize() {
      const newSize = Math.max(10, Math.min(200, parseInt(gridSizeInput.value) || 40));
      state.gridSize = newSize;
      gridSizeInput.value = newSize;
      createGround();
      rebuildGrid();
      updateRaycastPlanes();
    }

    gridSizeInput.addEventListener('change', applyGridSize);
    window._onGridSizeChange = applyGridSize;
  }
}

// Lazy import to avoid circular dependency
let _undoModule = null;
function require_undo() {
  if (!_undoModule) {
    // This will be set during initialization
    _undoModule = { performUndo: () => {} };
  }
  return _undoModule;
}

function setUndoModule(mod) {
  _undoModule = mod;
}

export { setTool, initToolbar, setUndoModule };
