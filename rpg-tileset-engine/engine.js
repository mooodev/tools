// ============================================================
// RPG Tileset Engine - Main Entry Point
// Orchestrates all engine modules
// ============================================================

import state from './modules/state.js';
import { renderer, scene, camera } from './modules/renderer.js';
import { initCameraControls } from './modules/camera.js';
import { initGrid } from './modules/grid.js';
import { createTileMesh, removeTileMesh, updateTileCount } from './modules/tiles.js';
import { setTileFunctions } from './modules/undo.js';
import { initTilesetControls } from './modules/tileset.js';
import { initViewportInput } from './modules/input.js';
import { initToolbar, setUndoModule } from './modules/toolbar.js';
import { initLightingControls } from './modules/lighting.js';
import { initSaveLoadControls } from './modules/saveload.js';
import { initParticleControls, updateParticles } from './modules/particles.js';
import { initKeyboard } from './modules/keyboard.js';
import { performUndo } from './modules/undo.js';

// Wire up cross-module dependencies
setTileFunctions(createTileMesh, removeTileMesh, updateTileCount);
setUndoModule({ performUndo });

// Initialize all systems
initCameraControls();
initGrid();
initTilesetControls();
initViewportInput();
initToolbar();
initLightingControls();
initSaveLoadControls();
initParticleControls();
initKeyboard();

// Render loop
let lastTime = performance.now();

function animate(time) {
  requestAnimationFrame(animate);
  const dt = (time - lastTime) / 1000;
  lastTime = time;

  updateParticles(dt);
  renderer.render(scene, camera);
}

requestAnimationFrame(animate);
