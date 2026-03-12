// ============================================================
// Tileset - Loading, panel rendering, selection, preview, zoom
// ============================================================

import state from './state.js';
import { removeTileMesh, createTileMesh } from './tiles.js';

const tilesetContainer = document.getElementById('tileset-container');

function loadTileset(dataUrl) {
  const img = new Image();
  img.onload = () => {
    state.tilesetImage = img;

    if (state.tilesetTexture) state.tilesetTexture.dispose();
    state.tilesetTexture = new THREE.Texture(img);
    state.tilesetTexture.magFilter = THREE.NearestFilter;
    state.tilesetTexture.minFilter = THREE.NearestFilter;
    state.tilesetTexture.needsUpdate = true;

    updateTilesetGrid();
    renderTilesetPanel();

    Object.keys(state.tileMeshes).forEach(key => {
      const data = state.mapTiles[key];
      if (data) {
        removeTileMesh(key);
        createTileMesh(key, data);
      }
    });
  };
  img.src = dataUrl;
}

function updateTilesetGrid() {
  if (!state.tilesetImage) return;
  state.tileW = parseInt(document.getElementById('tile-w').value) || 32;
  state.tileH = parseInt(document.getElementById('tile-h').value) || 32;
  state.tilesetCols = Math.floor(state.tilesetImage.width / state.tileW);
  state.tilesetRows = Math.floor(state.tilesetImage.height / state.tileH);
}

function renderTilesetPanel() {
  if (!state.tilesetImage) return;

  tilesetContainer.innerHTML = '';

  // Wrapper for zoom
  const wrapper = document.createElement('div');
  wrapper.style.cssText = `position:relative; transform-origin: 0 0; transform: scale(${state.tilesetZoom}); image-rendering: pixelated;`;

  const img = document.createElement('img');
  img.src = state.tilesetImage.src;
  wrapper.appendChild(img);

  const overlay = document.createElement('canvas');
  wrapper.appendChild(overlay);

  // Style overlay to cover the image
  overlay.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;';

  tilesetContainer.appendChild(wrapper);

  requestAnimationFrame(() => {
    const rect = img.getBoundingClientRect();
    overlay.width = rect.width;
    overlay.height = rect.height;
    drawTilesetOverlay(overlay);
  });

  tilesetContainer.style.cursor = 'crosshair';

  function getTileAtEvent(e) {
    const r = img.getBoundingClientRect();
    const scaleX = state.tilesetImage.width / r.width;
    const scaleY = state.tilesetImage.height / r.height;
    const px = (e.clientX - r.left) * scaleX;
    const py = (e.clientY - r.top) * scaleY;
    const col = Math.floor(px / state.tileW);
    const row = Math.floor(py / state.tileH);
    if (col >= 0 && col < state.tilesetCols && row >= 0 && row < state.tilesetRows) {
      return { col, row };
    }
    return null;
  }

  tilesetContainer.onmousedown = e => {
    const tile = getTileAtEvent(e);
    if (!tile) return;
    e.preventDefault();

    const mode = state.multiSelectMode;
    if (mode === 'single') {
      state.selectedTile = tile;
      state.selectedTiles = [tile];
      drawTilesetOverlay(overlay);
      updatePreview();
    } else if (mode === 'rect') {
      state.multiSelectStart = tile;
      state.multiSelectDragging = true;
    } else if (mode === 'free') {
      if (e.ctrlKey || e.metaKey) {
        const idx = state.selectedTiles.findIndex(t => t.col === tile.col && t.row === tile.row);
        if (idx >= 0) {
          state.selectedTiles.splice(idx, 1);
        } else {
          state.selectedTiles.push(tile);
        }
      } else {
        state.multiSelectDragging = true;
        state.selectedTiles = [tile];
      }
      state.selectedTile = state.selectedTiles[0] || null;
      drawTilesetOverlay(overlay);
      updatePreview();
    }
  };

  tilesetContainer.onmousemove = e => {
    if (!state.multiSelectDragging) return;
    const tile = getTileAtEvent(e);
    if (!tile) return;

    if (state.multiSelectMode === 'rect' && state.multiSelectStart) {
      const s = state.multiSelectStart;
      const minC = Math.min(s.col, tile.col), maxC = Math.max(s.col, tile.col);
      const minR = Math.min(s.row, tile.row), maxR = Math.max(s.row, tile.row);
      state.selectedTiles = [];
      for (let c = minC; c <= maxC; c++) {
        for (let r = minR; r <= maxR; r++) {
          state.selectedTiles.push({ col: c, row: r });
        }
      }
      state.selectedTile = state.selectedTiles[0] || null;
      drawTilesetOverlay(overlay);
      updatePreview();
    } else if (state.multiSelectMode === 'free') {
      const exists = state.selectedTiles.some(t => t.col === tile.col && t.row === tile.row);
      if (!exists) {
        state.selectedTiles.push(tile);
        state.selectedTile = state.selectedTiles[0] || null;
        drawTilesetOverlay(overlay);
        updatePreview();
      }
    }
  };

  tilesetContainer.onmouseup = e => {
    if (state.multiSelectDragging && state.multiSelectMode === 'rect' && state.multiSelectStart) {
      const tile = getTileAtEvent(e);
      if (tile) {
        const s = state.multiSelectStart;
        const minC = Math.min(s.col, tile.col), maxC = Math.max(s.col, tile.col);
        const minR = Math.min(s.row, tile.row), maxR = Math.max(s.row, tile.row);
        state.selectedTiles = [];
        for (let c = minC; c <= maxC; c++) {
          for (let r = minR; r <= maxR; r++) {
            state.selectedTiles.push({ col: c, row: r });
          }
        }
        state.selectedTile = state.selectedTiles[0] || null;
      }
    }
    state.multiSelectDragging = false;
    state.multiSelectStart = null;
    drawTilesetOverlay(overlay);
    updatePreview();
  };

  document.getElementById('no-tileset-msg')?.remove();
}

function drawTilesetOverlay(overlay) {
  const ctx = overlay.getContext('2d');
  ctx.clearRect(0, 0, overlay.width, overlay.height);

  const scaleX = overlay.width / state.tilesetImage.width;
  const scaleY = overlay.height / state.tilesetImage.height;
  const tw = state.tileW * scaleX;
  const th = state.tileH * scaleY;

  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  ctx.lineWidth = 0.5;
  for (let c = 0; c <= state.tilesetCols; c++) {
    ctx.beginPath();
    ctx.moveTo(c * tw, 0);
    ctx.lineTo(c * tw, state.tilesetRows * th);
    ctx.stroke();
  }
  for (let r = 0; r <= state.tilesetRows; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * th);
    ctx.lineTo(state.tilesetCols * tw, r * th);
    ctx.stroke();
  }

  const tilesToHighlight = state.selectedTiles.length > 0 ? state.selectedTiles :
    (state.selectedTile ? [state.selectedTile] : []);

  tilesToHighlight.forEach(tile => {
    ctx.strokeStyle = '#e94560';
    ctx.lineWidth = 2;
    ctx.strokeRect(tile.col * tw + 1, tile.row * th + 1, tw - 2, th - 2);
    ctx.fillStyle = 'rgba(233, 69, 96, 0.2)';
    ctx.fillRect(tile.col * tw, tile.row * th, tw, th);
  });
}

function updatePreview() {
  const previewCanvas = document.getElementById('preview-canvas');
  const ctx = previewCanvas.getContext('2d');
  const label = document.getElementById('preview-label');

  const tiles = state.selectedTiles.length > 0 ? state.selectedTiles :
    (state.selectedTile ? [state.selectedTile] : []);

  if (tiles.length === 0 || !state.tilesetImage) {
    previewCanvas.width = 48;
    previewCanvas.height = 48;
    ctx.clearRect(0, 0, 48, 48);
    label.textContent = 'No tile selected';
    return;
  }

  if (tiles.length === 1) {
    previewCanvas.width = 48;
    previewCanvas.height = 48;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, 48, 48);
    ctx.drawImage(
      state.tilesetImage,
      tiles[0].col * state.tileW,
      tiles[0].row * state.tileH,
      state.tileW,
      state.tileH,
      0, 0, 48, 48
    );
    label.textContent = `Tile (${tiles[0].col}, ${tiles[0].row})`;
  } else {
    let minC = Infinity, minR = Infinity, maxC = -Infinity, maxR = -Infinity;
    tiles.forEach(t => {
      if (t.col < minC) minC = t.col;
      if (t.row < minR) minR = t.row;
      if (t.col > maxC) maxC = t.col;
      if (t.row > maxR) maxR = t.row;
    });
    const cols = maxC - minC + 1;
    const rows = maxR - minR + 1;
    const tileSize = Math.max(8, Math.min(48, Math.floor(96 / Math.max(cols, rows))));
    previewCanvas.width = cols * tileSize;
    previewCanvas.height = rows * tileSize;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
    ctx.fillStyle = '#222';
    ctx.fillRect(0, 0, previewCanvas.width, previewCanvas.height);

    tiles.forEach(t => {
      const dx = (t.col - minC) * tileSize;
      const dy = (t.row - minR) * tileSize;
      ctx.drawImage(
        state.tilesetImage,
        t.col * state.tileW,
        t.row * state.tileH,
        state.tileW,
        state.tileH,
        dx, dy, tileSize, tileSize
      );
    });
    label.textContent = `${tiles.length} tiles selected`;
  }
}

function setTilesetZoom(zoom) {
  state.tilesetZoom = Math.max(0.5, Math.min(4.0, zoom));
  renderTilesetPanel();
}

function initTilesetControls() {
  const fileInput = document.getElementById('file-input');
  document.getElementById('upload-btn').addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => loadTileset(ev.target.result);
    reader.readAsDataURL(file);
  });

  document.getElementById('tile-w').addEventListener('change', () => { updateTilesetGrid(); renderTilesetPanel(); });
  document.getElementById('tile-h').addEventListener('change', () => { updateTilesetGrid(); renderTilesetPanel(); });

  // Tileset zoom controls
  const zoomIn = document.getElementById('tileset-zoom-in');
  const zoomOut = document.getElementById('tileset-zoom-out');
  const zoomReset = document.getElementById('tileset-zoom-reset');

  if (zoomIn) zoomIn.addEventListener('click', () => setTilesetZoom(state.tilesetZoom + 0.25));
  if (zoomOut) zoomOut.addEventListener('click', () => setTilesetZoom(state.tilesetZoom - 0.25));
  if (zoomReset) zoomReset.addEventListener('click', () => setTilesetZoom(1.0));

  // Scroll wheel zoom on tileset panel
  const tilesetScroll = document.getElementById('tileset-scroll');
  if (tilesetScroll) {
    tilesetScroll.addEventListener('wheel', e => {
      if (e.ctrlKey) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.25 : 0.25;
        setTilesetZoom(state.tilesetZoom + delta);
      }
    }, { passive: false });
  }

  // Multi-select mode buttons
  const selBtns = {
    single: document.getElementById('sel-single'),
    rect: document.getElementById('sel-rect'),
    free: document.getElementById('sel-free'),
  };

  function setSelectMode(mode) {
    state.multiSelectMode = mode;
    Object.keys(selBtns).forEach(m => selBtns[m].classList.toggle('active', m === mode));
  }

  selBtns.single.addEventListener('click', () => setSelectMode('single'));
  selBtns.rect.addEventListener('click', () => setSelectMode('rect'));
  selBtns.free.addEventListener('click', () => setSelectMode('free'));

  document.getElementById('sel-clear').addEventListener('click', () => {
    state.selectedTiles = [];
    state.selectedTile = null;
    const overlay = tilesetContainer.querySelector('canvas');
    if (overlay) drawTilesetOverlay(overlay);
    updatePreview();
  });
}

export {
  loadTileset,
  updateTilesetGrid,
  renderTilesetPanel,
  drawTilesetOverlay,
  updatePreview,
  setTilesetZoom,
  initTilesetControls,
};
