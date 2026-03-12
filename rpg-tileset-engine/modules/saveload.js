// ============================================================
// SaveLoad - Save and load map data
// ============================================================

import state from './state.js';
import { renderer, ambientLight, dirLight } from './renderer.js';
import { removeTileMesh, createTileMesh, updateTileCount } from './tiles.js';
import { addLight, removeLight } from './lighting.js';
import { loadTileset } from './tileset.js';

function saveMap() {
  const lightsData = state.userLights.map(l => ({
    type: l.type,
    color: l.color,
    intensity: l.intensity,
    x: l.x, y: l.y, z: l.z,
    castShadow: l.castShadow,
    distance: l.distance,
    angle: l.angle,
    penumbra: l.penumbra,
  }));

  const data = {
    version: 3,
    gridSize: state.gridSize,
    tileW: state.tileW,
    tileH: state.tileH,
    tilesetSrc: state.tilesetImage ? state.tilesetImage.src : null,
    tiles: state.mapTiles,
    lights: lightsData,
    ambientColor: '#' + ambientLight.color.getHexString(),
    ambientIntensity: ambientLight.intensity,
    shadowsEnabled: renderer.shadowMap.enabled,
    dirColor: '#' + dirLight.color.getHexString(),
    dirIntensity: dirLight.intensity,
    dirX: dirLight.position.x,
    dirY: dirLight.position.y,
    dirZ: dirLight.position.z,
    particleType: state.particleType || 'none',
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'rpg-map.json';
  a.click();
  URL.revokeObjectURL(url);
}

function loadMap(data) {
  Object.keys(state.tileMeshes).forEach(removeTileMesh);
  state.mapTiles = {};

  while (state.userLights.length > 0) {
    removeLight(state.userLights[0].id);
  }

  // Restore grid size
  if (data.gridSize) {
    state.gridSize = data.gridSize;
    const gridSizeInput = document.getElementById('grid-size-input');
    if (gridSizeInput) gridSizeInput.value = data.gridSize;
    // Trigger rebuild via event
    if (typeof window._onGridSizeChange === 'function') window._onGridSizeChange();
  }

  if (data.tileW) document.getElementById('tile-w').value = data.tileW;
  if (data.tileH) document.getElementById('tile-h').value = data.tileH;

  if (data.ambientColor) {
    ambientLight.color.set(data.ambientColor);
    document.getElementById('ambient-color').value = data.ambientColor;
  }
  if (data.ambientIntensity !== undefined) {
    ambientLight.intensity = data.ambientIntensity;
    document.getElementById('ambient-intensity').value = Math.round(data.ambientIntensity * 100);
    document.getElementById('ambient-val').textContent = data.ambientIntensity.toFixed(1);
  }
  if (data.shadowsEnabled !== undefined) {
    renderer.shadowMap.enabled = data.shadowsEnabled;
    document.getElementById('toggle-shadows').checked = data.shadowsEnabled;
  }
  if (data.dirColor) {
    dirLight.color.set(data.dirColor);
    document.getElementById('dir-color').value = data.dirColor;
  }
  if (data.dirIntensity !== undefined) {
    dirLight.intensity = data.dirIntensity;
    document.getElementById('dir-intensity').value = Math.round(data.dirIntensity * 100);
    document.getElementById('dir-intensity-val').textContent = data.dirIntensity.toFixed(1);
  }
  if (data.dirX !== undefined) {
    dirLight.position.set(data.dirX, data.dirY, data.dirZ);
    document.getElementById('dir-x').value = data.dirX;
    document.getElementById('dir-y').value = data.dirY;
    document.getElementById('dir-z').value = data.dirZ;
  }

  if (data.lights) {
    data.lights.forEach(lconf => addLight(lconf.type, lconf));
  }

  // Restore particles
  if (data.particleType && data.particleType !== 'none') {
    const particleSelect = document.getElementById('particle-select');
    if (particleSelect) {
      particleSelect.value = data.particleType;
      particleSelect.dispatchEvent(new Event('change'));
    }
  }

  if (data.tilesetSrc) {
    loadTileset(data.tilesetSrc);
    const img = new Image();
    img.onload = () => {
      state.mapTiles = data.tiles || {};
      Object.keys(state.mapTiles).forEach(key => {
        createTileMesh(key, state.mapTiles[key]);
      });
      updateTileCount();
    };
    img.src = data.tilesetSrc;
  } else {
    state.mapTiles = data.tiles || {};
    updateTileCount();
  }
}

function initSaveLoadControls() {
  document.getElementById('btn-save').addEventListener('click', saveMap);
  document.getElementById('btn-load').addEventListener('click', () => {
    document.getElementById('load-input').click();
  });

  document.getElementById('load-input').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const data = JSON.parse(ev.target.result);
        loadMap(data);
      } catch (err) {
        alert('Invalid map file');
      }
    };
    reader.readAsText(file);
  });
}

export { saveMap, loadMap, initSaveLoadControls };
