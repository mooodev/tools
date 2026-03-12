// ============================================================
// Keyboard - Keyboard shortcuts
// ============================================================

import state from './state.js';
import { TILE_WORLD_SIZE } from './constants.js';
import { setTool } from './toolbar.js';
import { performUndo } from './undo.js';
import { saveMap } from './saveload.js';
import { getGridHelper } from './grid.js';

function initKeyboard() {
  const heightSlider = document.getElementById('height-slider-tb');
  const lightingPanel = document.getElementById('lighting-panel');

  window.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;

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
  });
}

export { initKeyboard };
