// ============================================================
// Undo - Undo system
// ============================================================

import state from './state.js';

// Forward references set by tiles module
let _createTileMesh = null;
let _removeTileMesh = null;
let _updateTileCount = null;

function setTileFunctions(createFn, removeFn, countFn) {
  _createTileMesh = createFn;
  _removeTileMesh = removeFn;
  _updateTileCount = countFn;
}

function pushUndo(entry) {
  if (entry.entries.length === 0) return;
  state.undoStack.push(entry);
  if (state.undoStack.length > state.maxUndoSteps) {
    state.undoStack.shift();
  }
}

function performUndo() {
  if (state.undoStack.length === 0) return;
  const entry = state.undoStack.pop();
  for (let i = entry.entries.length - 1; i >= 0; i--) {
    const e = entry.entries[i];
    if (_removeTileMesh) _removeTileMesh(e.key);
    if (e.oldData) {
      state.mapTiles[e.key] = e.oldData;
      if (_createTileMesh) _createTileMesh(e.key, e.oldData);
    } else {
      delete state.mapTiles[e.key];
    }
  }
  if (_updateTileCount) _updateTileCount();
}

export { pushUndo, performUndo, setTileFunctions };
