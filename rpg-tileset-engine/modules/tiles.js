// ============================================================
// Tiles - Tile placement, erasure, mesh management
// ============================================================

import state from './state.js';
import { scene } from './renderer.js';
import {
  createFlatTileMesh,
  createBlockMesh,
  createPrismMesh,
  createWallMesh,
  createSidePlaneMesh,
} from './shapes.js';
import { pushUndo } from './undo.js';

function createTileMesh(key, tileData) {
  if (!state.tilesetTexture) return;

  const shape = tileData.shape || 'tile';
  let mesh;
  switch (shape) {
    case 'block':  mesh = createBlockMesh(key, tileData); break;
    case 'prism':  mesh = createPrismMesh(key, tileData); break;
    case 'wall':   mesh = createWallMesh(key, tileData); break;
    case 'sideplane': mesh = createSidePlaneMesh(key, tileData); break;
    default:       mesh = createFlatTileMesh(key, tileData); break;
  }

  state.tileMeshes[key] = mesh;
}

function removeTileMesh(key) {
  const obj = state.tileMeshes[key];
  if (obj) {
    obj.traverse(child => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach(m => m.dispose());
        } else {
          child.material.dispose();
        }
      }
    });
    if (obj.parent) {
      obj.parent.remove(obj);
    } else {
      scene.remove(obj);
    }
    delete state.tileMeshes[key];
  }
}

function tileKey(x, z, y, face, layer) {
  layer = layer !== undefined ? layer : state.layer;
  return `${x},${z},${y},${face},L${layer}`;
}

function placeTile(x, z, undoEntries, tileOverride) {
  const tile = tileOverride || state.selectedTile;
  if (!tile || !state.tilesetTexture) return;
  if (x < 0 || x >= state.gridSize || z < 0 || z >= state.gridSize) return;

  const shape = state.shape;
  const face = shape === 'wall' || shape === 'block' || shape === 'prism' || shape === 'sideplane' ? 'top' : state.face;
  const key = tileKey(x, z, state.heightLevel, face + '_' + shape + '_' + state.rotation);

  const data = {
    col: tile.col,
    row: tile.row,
    shape: shape,
    rotation: state.rotation,
  };

  if (shape === 'block') {
    data.blockW = state.blockW;
    data.blockH = state.blockH;
    data.blockD = state.blockD;
  }

  if (shape === 'prism') {
    data.prismHalf = state.prismHalf;
  }

  const oldData = state.mapTiles[key] ? { ...state.mapTiles[key] } : null;
  if (undoEntries) {
    undoEntries.push({ key, oldData, newData: { ...data } });
  }

  removeTileMesh(key);
  state.mapTiles[key] = data;
  createTileMesh(key, data);
  updateTileCount();
}

function placeFrontLeftTile(x, z, heightY, undoEntries, tileOverride) {
  const tile = tileOverride || state.selectedTile;
  if (!tile || !state.tilesetTexture) return;
  if (x < 0 || x >= state.gridSize || z < 0 || z >= state.gridSize) return;

  const shape = state.shape;
  const face = state.face;
  const key = tileKey(x, z, heightY, face + '_' + shape + '_' + state.rotation);

  const data = {
    col: tile.col,
    row: tile.row,
    shape: shape,
    rotation: state.rotation,
  };

  const oldData = state.mapTiles[key] ? { ...state.mapTiles[key] } : null;
  if (undoEntries) {
    undoEntries.push({ key, oldData, newData: { ...data } });
  }

  removeTileMesh(key);
  state.mapTiles[key] = data;
  createTileMesh(key, data);
  updateTileCount();
}

function eraseTile(x, z, undoEntries) {
  if (x < 0 || x >= state.gridSize || z < 0 || z >= state.gridSize) return;

  const shapes = ['tile', 'block', 'prism', 'wall', 'sideplane'];
  const rotations = [0, 90, 180, 270];
  const faces = ['top', 'front', 'left'];
  const layers = [0, 1];

  let erased = false;
  for (const s of shapes) {
    for (const r of rotations) {
      for (const f of faces) {
        for (const lay of layers) {
          const key = tileKey(x, z, state.heightLevel, f + '_' + s + '_' + r, lay);
          if (state.mapTiles[key]) {
            if (undoEntries) {
              undoEntries.push({ key, oldData: { ...state.mapTiles[key] }, newData: null });
            }
            removeTileMesh(key);
            delete state.mapTiles[key];
            erased = true;
          }
        }
      }
    }
  }

  const legacyKey1 = `${x},${z},${state.heightLevel},${state.face}`;
  if (state.mapTiles[legacyKey1]) {
    if (undoEntries) {
      undoEntries.push({ key: legacyKey1, oldData: { ...state.mapTiles[legacyKey1] }, newData: null });
    }
    removeTileMesh(legacyKey1);
    delete state.mapTiles[legacyKey1];
    erased = true;
  }

  if (erased) updateTileCount();
}

function fillRect(x1, z1, x2, z2) {
  const minX = Math.min(x1, x2);
  const maxX = Math.max(x1, x2);
  const minZ = Math.min(z1, z2);
  const maxZ = Math.max(z1, z2);

  const undoEntries = [];

  if (state.face === 'top' || state.shape !== 'tile') {
    for (let x = minX; x <= maxX; x++) {
      for (let z = minZ; z <= maxZ; z++) {
        if (state.tool === 'erase') {
          eraseTile(x, z, undoEntries);
        } else {
          placeTile(x, z, undoEntries);
        }
      }
    }
  } else {
    // For front/left face rect fill, stack horizontally and vertically
    for (let x = minX; x <= maxX; x++) {
      for (let z = minZ; z <= maxZ; z++) {
        if (state.tool === 'erase') {
          eraseTile(x, z, undoEntries);
        } else {
          placeTile(x, z, undoEntries);
        }
      }
    }
  }

  if (undoEntries.length > 0) {
    pushUndo({ action: state.tool === 'erase' ? 'erase-rect' : 'fill-rect', entries: undoEntries });
  }
}

// Place multiple selected tiles as a pattern
// For flat tiles with front/left face: tiles stack horizontally (cols=X offset) and
// vertically (rows=height offset) rather than along Z
function placeMultiTile(x, z, undoEntries) {
  if (state.selectedTiles.length <= 1) {
    placeTile(x, z, undoEntries);
    return;
  }

  let minCol = Infinity, minRow = Infinity, maxRow = -Infinity;
  state.selectedTiles.forEach(t => {
    if (t.col < minCol) minCol = t.col;
    if (t.row < minRow) minRow = t.row;
    if (t.row > maxRow) maxRow = t.row;
  });
  const rowSpan = maxRow - minRow;

  if (state.shape === 'tile' && state.face === 'front') {
    // For front face: col offset = X, row offset = height (Y)
    // Invert rows so top of tileset = top of wall (highest Y)
    state.selectedTiles.forEach(t => {
      const dx = t.col - minCol;
      const dy = t.row - minRow;
      placeFrontLeftTile(x + dx, z, state.heightLevel + rowSpan - dy, undoEntries, { col: t.col, row: t.row });
    });
  } else if (state.shape === 'tile' && state.face === 'left') {
    // For left face: col offset = Z, row offset = height (Y)
    // Invert rows so top of tileset = top of wall (highest Y)
    state.selectedTiles.forEach(t => {
      const dz = t.col - minCol;
      const dy = t.row - minRow;
      placeFrontLeftTile(x, z + dz, state.heightLevel + rowSpan - dy, undoEntries, { col: t.col, row: t.row });
    });
  } else {
    // Top face and 3D shapes: col offset = X, row offset = Z (horizontal tiling)
    state.selectedTiles.forEach(t => {
      const dx = t.col - minCol;
      const dz = t.row - minRow;
      placeTile(x + dx, z + dz, undoEntries, { col: t.col, row: t.row });
    });
  }
}

function updateTileCount() {
  document.getElementById('info-tiles').textContent = `Tiles: ${Object.keys(state.mapTiles).length}`;
}

export {
  createTileMesh,
  removeTileMesh,
  tileKey,
  placeTile,
  placeFrontLeftTile,
  eraseTile,
  fillRect,
  placeMultiTile,
  updateTileCount,
};
