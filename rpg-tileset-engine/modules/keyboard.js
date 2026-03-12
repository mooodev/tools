// ============================================================
// Keyboard - Keyboard shortcuts
// ============================================================

import state from './state.js';
import { TILE_WORLD_SIZE } from './constants.js';
import { setTool } from './toolbar.js';
import { performUndo } from './undo.js';
import { saveMap } from './saveload.js';
import { getGridHelper } from './grid.js';
import { camState, updateCamera } from './camera.js';
import { camera } from './renderer.js';

const PAN_SPEED = 0.8;

function initKeyboard() {
  const heightSlider = document.getElementById('height-slider-tb');
  const lightingPanel = document.getElementById('lighting-panel');

  const keysDown = {};

  window.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;

    keysDown[e.key] = true;

    switch (e.key.toLowerCase()) {
      case 'd': setTool('draw'); break;
      case 'e': setTool('erase'); break;
      case 'r': setTool('rect'); break;
      case 'g':
        state.showGrid = !state.showGrid;
        const gh = getGridHelper();
        if (gh) gh.visible = state.showGrid;
        document.getElementById('btn-grid').classList.toggle('active', state.showGrid);
        break;
      case 'l':
        lightingPanel.classList.toggle('visible');
        break;
      case 's':
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          saveMap();
        }
        break;
      case 'z':
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          performUndo();
        }
        break;
    }

    if (e.key === '=' || e.key === '+') {
      heightSlider.value = Math.min(10, state.heightLevel + 1);
      heightSlider.dispatchEvent(new Event('input'));
    }
    if (e.key === '-') {
      heightSlider.value = Math.max(0, state.heightLevel - 1);
      heightSlider.dispatchEvent(new Event('input'));
    }

    if (e.key.toLowerCase() === 'q') {
      state.rotation = (state.rotation + 270) % 360;
      document.getElementById('rotation-select').value = state.rotation;
    }
    if (e.key.toLowerCase() === 'w') {
      state.rotation = (state.rotation + 90) % 360;
      document.getElementById('rotation-select').value = state.rotation;
    }

    // Arrow key map movement
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      panCameraArrowKey(e.key);
    }
  });

  window.addEventListener('keyup', e => {
    delete keysDown[e.key];
  });
}

function panCameraArrowKey(key) {
  // Calculate camera-relative right and forward directions on the XZ plane
  const right = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  camera.getWorldDirection(right).cross(up).normalize();

  const forward = new THREE.Vector3();
  camera.getWorldDirection(forward);
  forward.y = 0;
  forward.normalize();

  switch (key) {
    case 'ArrowUp':
      camState.target.addScaledVector(forward, PAN_SPEED);
      break;
    case 'ArrowDown':
      camState.target.addScaledVector(forward, -PAN_SPEED);
      break;
    case 'ArrowLeft':
      camState.target.addScaledVector(right, -PAN_SPEED);
      break;
    case 'ArrowRight':
      camState.target.addScaledVector(right, PAN_SPEED);
      break;
  }

  updateCamera();
}

export { initKeyboard };
