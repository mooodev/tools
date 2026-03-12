// ============================================================
// RPG Tileset Engine - Three.js based RPG Paper Maker style editor
// ============================================================

(function () {
  'use strict';

  // ---- Constants ----
  const TILE_WORLD_SIZE = 1; // 1 unit per tile in 3D space
  const GRID_SIZE = 40;      // 40x40 grid
  const GRID_COLOR = 0x3355aa;
  const GRID_COLOR_HIGHLIGHT = 0xe94560;

  // ---- State ----
  const state = {
    tool: 'draw',         // draw, erase, rect
    face: 'top',          // top, front, left
    heightLevel: 0,
    tileW: 32,
    tileH: 32,
    showGrid: true,

    // Tileset
    tilesetImage: null,
    tilesetTexture: null,
    tilesetCols: 0,
    tilesetRows: 0,
    selectedTile: null,   // { col, row }

    // Map data: key = "x,z,y,face" -> { col, row }
    mapTiles: {},

    // Three.js tile meshes: same key -> mesh
    tileMeshes: {},

    // Rect tool state
    rectStart: null,

    // Hover
    hoverPos: null,
  };

  // ---- Three.js Setup ----
  const canvas = document.getElementById('viewport');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setClearColor(0x1a1a2e);
  renderer.shadowMap.enabled = true;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x1a1a2e, 30, 80);

  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
  camera.position.set(10, 12, 10);
  camera.lookAt(GRID_SIZE / 4, 0, GRID_SIZE / 4);

  // Lights
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambientLight);

  const dirLight = new THREE.DirectionalLight(0xffffff, 0.7);
  dirLight.position.set(15, 20, 10);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.set(2048, 2048);
  dirLight.shadow.camera.left = -30;
  dirLight.shadow.camera.right = 30;
  dirLight.shadow.camera.top = 30;
  dirLight.shadow.camera.bottom = -30;
  scene.add(dirLight);

  // Ground plane
  const groundGeo = new THREE.PlaneGeometry(GRID_SIZE, GRID_SIZE);
  const groundMat = new THREE.MeshStandardMaterial({
    color: 0x222244,
    roughness: 0.9,
    metalness: 0.0,
  });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(GRID_SIZE / 2, -0.01, GRID_SIZE / 2);
  ground.receiveShadow = true;
  scene.add(ground);

  // Grid helper
  let gridHelper = createGrid();
  scene.add(gridHelper);

  // Hover indicator
  const hoverGeo = new THREE.PlaneGeometry(TILE_WORLD_SIZE, TILE_WORLD_SIZE);
  const hoverMat = new THREE.MeshBasicMaterial({
    color: GRID_COLOR_HIGHLIGHT,
    transparent: true,
    opacity: 0.35,
    side: THREE.DoubleSide,
    depthTest: false,
  });
  const hoverMesh = new THREE.Mesh(hoverGeo, hoverMat);
  hoverMesh.visible = false;
  scene.add(hoverMesh);

  // Raycaster planes for each face type
  const raycasterPlanes = {};
  function updateRaycastPlanes() {
    // Remove old
    Object.values(raycasterPlanes).forEach(p => scene.remove(p));

    const h = state.heightLevel;

    // Top face plane (horizontal at height h)
    const topGeo = new THREE.PlaneGeometry(GRID_SIZE * 2, GRID_SIZE * 2);
    const topMat = new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide });
    const topPlane = new THREE.Mesh(topGeo, topMat);
    topPlane.rotation.x = -Math.PI / 2;
    topPlane.position.y = h * TILE_WORLD_SIZE;
    scene.add(topPlane);
    raycasterPlanes.top = topPlane;

    // Front face plane (vertical, facing camera Z direction)
    const frontGeo = new THREE.PlaneGeometry(GRID_SIZE * 2, 20);
    const frontMat = new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide });
    const frontPlane = new THREE.Mesh(frontGeo, frontMat);
    frontPlane.position.y = 10;
    frontPlane.position.z = 0; // will be updated by hover
    scene.add(frontPlane);
    raycasterPlanes.front = frontPlane;

    // Left face plane (vertical, facing X direction)
    const leftGeo = new THREE.PlaneGeometry(GRID_SIZE * 2, 20);
    const leftMat = new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide });
    const leftPlane = new THREE.Mesh(leftGeo, leftMat);
    leftPlane.rotation.y = Math.PI / 2;
    leftPlane.position.y = 10;
    leftPlane.position.x = 0;
    scene.add(leftPlane);
    raycasterPlanes.left = leftPlane;
  }
  updateRaycastPlanes();

  // Raycaster
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();

  // ---- Grid Creation ----
  function createGrid() {
    const group = new THREE.Group();
    const material = new THREE.LineBasicMaterial({ color: GRID_COLOR, transparent: true, opacity: 0.3 });

    for (let i = 0; i <= GRID_SIZE; i++) {
      const points1 = [new THREE.Vector3(i, 0.005, 0), new THREE.Vector3(i, 0.005, GRID_SIZE)];
      const points2 = [new THREE.Vector3(0, 0.005, i), new THREE.Vector3(GRID_SIZE, 0.005, i)];
      group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points1), material));
      group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points2), material));
    }
    return group;
  }

  // ---- Camera Controls (custom orbit) ----
  const camState = {
    target: new THREE.Vector3(GRID_SIZE / 4, 0, GRID_SIZE / 4),
    spherical: new THREE.Spherical(18, Math.PI / 4, Math.PI / 4),
    isDragging: false,
    isPanning: false,
    lastMouse: { x: 0, y: 0 },
  };

  function updateCamera() {
    const pos = new THREE.Vector3().setFromSpherical(camState.spherical).add(camState.target);
    camera.position.copy(pos);
    camera.lookAt(camState.target);
  }
  updateCamera();

  canvas.addEventListener('contextmenu', e => e.preventDefault());

  canvas.addEventListener('mousedown', e => {
    if (e.button === 2) {
      camState.isDragging = true;
      camState.lastMouse = { x: e.clientX, y: e.clientY };
    } else if (e.button === 1) {
      e.preventDefault();
      camState.isPanning = true;
      camState.lastMouse = { x: e.clientX, y: e.clientY };
    }
  });

  window.addEventListener('mousemove', e => {
    if (camState.isDragging) {
      const dx = e.clientX - camState.lastMouse.x;
      const dy = e.clientY - camState.lastMouse.y;
      camState.spherical.theta -= dx * 0.008;
      camState.spherical.phi -= dy * 0.008;
      camState.spherical.phi = Math.max(0.1, Math.min(Math.PI / 2 - 0.05, camState.spherical.phi));
      camState.lastMouse = { x: e.clientX, y: e.clientY };
      updateCamera();
    }
    if (camState.isPanning) {
      const dx = e.clientX - camState.lastMouse.x;
      const dy = e.clientY - camState.lastMouse.y;
      const right = new THREE.Vector3();
      const up = new THREE.Vector3(0, 1, 0);
      camera.getWorldDirection(right).cross(up).normalize();
      const forward = new THREE.Vector3();
      camera.getWorldDirection(forward);
      forward.y = 0;
      forward.normalize();
      camState.target.addScaledVector(right, -dx * 0.03);
      camState.target.addScaledVector(forward, dy * 0.03);
      camState.lastMouse = { x: e.clientX, y: e.clientY };
      updateCamera();
    }
  });

  window.addEventListener('mouseup', e => {
    if (e.button === 2) camState.isDragging = false;
    if (e.button === 1) camState.isPanning = false;
  });

  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    camState.spherical.radius += e.deltaY * 0.02;
    camState.spherical.radius = Math.max(3, Math.min(60, camState.spherical.radius));
    updateCamera();
  }, { passive: false });

  // ---- Resize ----
  function resize() {
    const container = document.getElementById('viewport-container');
    const w = container.clientWidth;
    const h = container.clientHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  // ---- Tileset Management ----
  const fileInput = document.getElementById('file-input');
  const tilesetContainer = document.getElementById('tileset-container');

  document.getElementById('upload-btn').addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => loadTileset(ev.target.result);
    reader.readAsDataURL(file);
  });

  function loadTileset(dataUrl) {
    const img = new Image();
    img.onload = () => {
      state.tilesetImage = img;

      // Update Three.js texture
      if (state.tilesetTexture) state.tilesetTexture.dispose();
      state.tilesetTexture = new THREE.Texture(img);
      state.tilesetTexture.magFilter = THREE.NearestFilter;
      state.tilesetTexture.minFilter = THREE.NearestFilter;
      state.tilesetTexture.needsUpdate = true;

      updateTilesetGrid();
      renderTilesetPanel();

      // Re-apply texture to existing tiles
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

  document.getElementById('tile-w').addEventListener('change', () => { updateTilesetGrid(); renderTilesetPanel(); });
  document.getElementById('tile-h').addEventListener('change', () => { updateTilesetGrid(); renderTilesetPanel(); });

  function renderTilesetPanel() {
    if (!state.tilesetImage) return;

    tilesetContainer.innerHTML = '';

    const img = document.createElement('img');
    img.src = state.tilesetImage.src;
    tilesetContainer.appendChild(img);

    // Overlay canvas for grid + selection
    const overlay = document.createElement('canvas');
    tilesetContainer.appendChild(overlay);

    // Wait for image to lay out
    requestAnimationFrame(() => {
      const rect = img.getBoundingClientRect();
      overlay.width = rect.width;
      overlay.height = rect.height;
      drawTilesetOverlay(overlay);
    });

    // Click handler
    tilesetContainer.style.cursor = 'crosshair';
    tilesetContainer.onclick = e => {
      const rect = img.getBoundingClientRect();
      const scaleX = state.tilesetImage.width / rect.width;
      const scaleY = state.tilesetImage.height / rect.height;
      const px = (e.clientX - rect.left) * scaleX;
      const py = (e.clientY - rect.top) * scaleY;
      const col = Math.floor(px / state.tileW);
      const row = Math.floor(py / state.tileH);
      if (col >= 0 && col < state.tilesetCols && row >= 0 && row < state.tilesetRows) {
        state.selectedTile = { col, row };
        drawTilesetOverlay(overlay);
        updatePreview();
      }
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

    // Draw grid
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

    // Highlight selected
    if (state.selectedTile) {
      ctx.strokeStyle = '#e94560';
      ctx.lineWidth = 2;
      ctx.strokeRect(
        state.selectedTile.col * tw + 1,
        state.selectedTile.row * th + 1,
        tw - 2,
        th - 2
      );
      ctx.fillStyle = 'rgba(233, 69, 96, 0.2)';
      ctx.fillRect(
        state.selectedTile.col * tw,
        state.selectedTile.row * th,
        tw,
        th
      );
    }
  }

  function updatePreview() {
    const previewCanvas = document.getElementById('preview-canvas');
    const ctx = previewCanvas.getContext('2d');
    const label = document.getElementById('preview-label');

    ctx.clearRect(0, 0, 48, 48);

    if (state.selectedTile && state.tilesetImage) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(
        state.tilesetImage,
        state.selectedTile.col * state.tileW,
        state.selectedTile.row * state.tileH,
        state.tileW,
        state.tileH,
        0, 0, 48, 48
      );
      label.textContent = `Tile (${state.selectedTile.col}, ${state.selectedTile.row})`;
    } else {
      label.textContent = 'No tile selected';
    }
  }

  // ---- 3D Tile Mesh Creation ----
  function getTileUV(col, row) {
    const cols = state.tilesetCols;
    const rows = state.tilesetRows;
    const u0 = col / cols;
    const u1 = (col + 1) / cols;
    const v0 = row / rows;
    const v1 = (row + 1) / rows;
    // Three.js UV: bottom-left origin, but image is top-left
    return { u0, u1, v0: 1 - v1, v1: 1 - v0 };
  }

  function createTileMesh(key, tileData) {
    if (!state.tilesetTexture) return;

    const parts = key.split(',');
    const x = parseInt(parts[0]);
    const z = parseInt(parts[1]);
    const y = parseInt(parts[2]);
    const face = parts[3];

    const { col, row } = tileData;
    const uv = getTileUV(col, row);

    let geometry, mesh;
    const material = new THREE.MeshStandardMaterial({
      map: state.tilesetTexture,
      roughness: 0.8,
      metalness: 0.0,
      side: THREE.DoubleSide,
      transparent: true,
      alphaTest: 0.1,
    });

    if (face === 'top') {
      geometry = new THREE.PlaneGeometry(TILE_WORLD_SIZE, TILE_WORLD_SIZE);
      mesh = new THREE.Mesh(geometry, material);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(x + 0.5, y * TILE_WORLD_SIZE + 0.005, z + 0.5);
    } else if (face === 'front') {
      geometry = new THREE.PlaneGeometry(TILE_WORLD_SIZE, TILE_WORLD_SIZE);
      mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(x + 0.5, y * TILE_WORLD_SIZE + 0.5, z);
    } else if (face === 'left') {
      geometry = new THREE.PlaneGeometry(TILE_WORLD_SIZE, TILE_WORLD_SIZE);
      mesh = new THREE.Mesh(geometry, material);
      mesh.rotation.y = Math.PI / 2;
      mesh.position.set(x, y * TILE_WORLD_SIZE + 0.5, z + 0.5);
    }

    // Set UV coordinates
    const uvAttr = geometry.attributes.uv;
    uvAttr.setXY(0, uv.u0, uv.v1); // top-left
    uvAttr.setXY(1, uv.u1, uv.v1); // top-right
    uvAttr.setXY(2, uv.u0, uv.v0); // bottom-left
    uvAttr.setXY(3, uv.u1, uv.v0); // bottom-right
    uvAttr.needsUpdate = true;

    mesh.castShadow = true;
    mesh.receiveShadow = true;

    scene.add(mesh);
    state.tileMeshes[key] = mesh;
  }

  function removeTileMesh(key) {
    const mesh = state.tileMeshes[key];
    if (mesh) {
      scene.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.dispose();
      delete state.tileMeshes[key];
    }
  }

  function tileKey(x, z, y, face) {
    return `${x},${z},${y},${face}`;
  }

  function placeTile(x, z) {
    if (!state.selectedTile || !state.tilesetTexture) return;
    if (x < 0 || x >= GRID_SIZE || z < 0 || z >= GRID_SIZE) return;

    const key = tileKey(x, z, state.heightLevel, state.face);
    const data = { col: state.selectedTile.col, row: state.selectedTile.row };

    // Remove existing tile at this position/face
    removeTileMesh(key);

    state.mapTiles[key] = data;
    createTileMesh(key, data);
    updateTileCount();
  }

  function eraseTile(x, z) {
    if (x < 0 || x >= GRID_SIZE || z < 0 || z >= GRID_SIZE) return;

    const key = tileKey(x, z, state.heightLevel, state.face);
    removeTileMesh(key);
    delete state.mapTiles[key];
    updateTileCount();
  }

  function fillRect(x1, z1, x2, z2) {
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    const minZ = Math.min(z1, z2);
    const maxZ = Math.max(z1, z2);

    for (let x = minX; x <= maxX; x++) {
      for (let z = minZ; z <= maxZ; z++) {
        if (state.tool === 'erase') {
          eraseTile(x, z);
        } else {
          placeTile(x, z);
        }
      }
    }
  }

  function updateTileCount() {
    document.getElementById('info-tiles').textContent = `Tiles: ${Object.keys(state.mapTiles).length}`;
  }

  // ---- Viewport Mouse Interaction ----
  function getGridPos(e) {
    const rect = canvas.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);

    // Intersect with the appropriate plane
    const plane = raycasterPlanes[state.face];
    if (!plane) return null;

    const intersects = raycaster.intersectObject(plane);
    if (intersects.length === 0) return null;

    const point = intersects[0].point;

    let gx, gz;
    if (state.face === 'top') {
      gx = Math.floor(point.x);
      gz = Math.floor(point.z);
    } else if (state.face === 'front') {
      gx = Math.floor(point.x);
      gz = Math.round(point.z);
    } else if (state.face === 'left') {
      gx = Math.round(point.x);
      gz = Math.floor(point.z);
    }

    if (gx < 0 || gx >= GRID_SIZE || gz < 0 || gz >= GRID_SIZE) return null;

    return { x: gx, z: gz };
  }

  let isDrawing = false;

  canvas.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    if (camState.isDragging || camState.isPanning) return;

    const pos = getGridPos(e);
    if (!pos) return;

    if (state.tool === 'rect') {
      state.rectStart = pos;
    } else if (state.tool === 'draw') {
      isDrawing = true;
      placeTile(pos.x, pos.z);
    } else if (state.tool === 'erase') {
      isDrawing = true;
      eraseTile(pos.x, pos.z);
    }
  });

  canvas.addEventListener('mousemove', e => {
    const pos = getGridPos(e);
    if (pos) {
      state.hoverPos = pos;
      document.getElementById('info-pos').textContent = `Position: (${pos.x}, ${pos.z}) H:${state.heightLevel}`;

      // Update hover mesh
      hoverMesh.visible = true;
      if (state.face === 'top') {
        hoverMesh.rotation.set(-Math.PI / 2, 0, 0);
        hoverMesh.position.set(pos.x + 0.5, state.heightLevel * TILE_WORLD_SIZE + 0.01, pos.z + 0.5);
      } else if (state.face === 'front') {
        hoverMesh.rotation.set(0, 0, 0);
        hoverMesh.position.set(pos.x + 0.5, state.heightLevel * TILE_WORLD_SIZE + 0.5, pos.z);
      } else if (state.face === 'left') {
        hoverMesh.rotation.set(0, Math.PI / 2, 0);
        hoverMesh.position.set(pos.x, state.heightLevel * TILE_WORLD_SIZE + 0.5, pos.z + 0.5);
      }

      // Continuous drawing
      if (isDrawing) {
        if (state.tool === 'draw') placeTile(pos.x, pos.z);
        else if (state.tool === 'erase') eraseTile(pos.x, pos.z);
      }
    } else {
      hoverMesh.visible = false;
    }
  });

  canvas.addEventListener('mouseup', e => {
    if (e.button !== 0) return;

    if (state.tool === 'rect' && state.rectStart) {
      const pos = getGridPos(e);
      if (pos) {
        fillRect(state.rectStart.x, state.rectStart.z, pos.x, pos.z);
      }
      state.rectStart = null;
    }

    isDrawing = false;
  });

  canvas.addEventListener('mouseleave', () => {
    hoverMesh.visible = false;
    isDrawing = false;
  });

  // ---- Toolbar Buttons ----
  const toolBtns = {
    draw: document.getElementById('btn-draw'),
    erase: document.getElementById('btn-erase'),
    rect: document.getElementById('btn-rect'),
  };

  function setTool(tool) {
    state.tool = tool;
    Object.keys(toolBtns).forEach(t => toolBtns[t].classList.toggle('active', t === tool));
  }

  toolBtns.draw.addEventListener('click', () => setTool('draw'));
  toolBtns.erase.addEventListener('click', () => setTool('erase'));
  toolBtns.rect.addEventListener('click', () => setTool('rect'));

  document.getElementById('face-select').addEventListener('change', e => {
    state.face = e.target.value;
    updateRaycastPlanes();
  });

  const heightSlider = document.getElementById('height-slider-tb');
  const heightVal = document.getElementById('height-val');
  heightSlider.addEventListener('input', () => {
    state.heightLevel = parseInt(heightSlider.value);
    heightVal.textContent = state.heightLevel;
    updateRaycastPlanes();

    // Update grid height visualization
    gridHelper.position.y = state.heightLevel * TILE_WORLD_SIZE;
  });

  document.getElementById('btn-grid').addEventListener('click', () => {
    state.showGrid = !state.showGrid;
    gridHelper.visible = state.showGrid;
    document.getElementById('btn-grid').classList.toggle('active', state.showGrid);
  });

  document.getElementById('btn-clear').addEventListener('click', () => {
    if (!confirm('Clear all tiles?')) return;
    Object.keys(state.tileMeshes).forEach(removeTileMesh);
    state.mapTiles = {};
    updateTileCount();
  });

  // ---- Save / Load ----
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

  function saveMap() {
    const data = {
      version: 1,
      tileW: state.tileW,
      tileH: state.tileH,
      tilesetSrc: state.tilesetImage ? state.tilesetImage.src : null,
      tiles: state.mapTiles,
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
    // Clear existing
    Object.keys(state.tileMeshes).forEach(removeTileMesh);
    state.mapTiles = {};

    if (data.tileW) document.getElementById('tile-w').value = data.tileW;
    if (data.tileH) document.getElementById('tile-h').value = data.tileH;

    if (data.tilesetSrc) {
      loadTileset(data.tilesetSrc);
      // After tileset loads, place tiles
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

  // ---- Keyboard Shortcuts ----
  window.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;

    switch (e.key.toLowerCase()) {
      case 'd': setTool('draw'); break;
      case 'e': setTool('erase'); break;
      case 'r': setTool('rect'); break;
      case 'g':
        state.showGrid = !state.showGrid;
        gridHelper.visible = state.showGrid;
        document.getElementById('btn-grid').classList.toggle('active', state.showGrid);
        break;
      case 's':
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          saveMap();
        }
        break;
    }

    // Height adjustment with +/-
    if (e.key === '=' || e.key === '+') {
      heightSlider.value = Math.min(10, state.heightLevel + 1);
      heightSlider.dispatchEvent(new Event('input'));
    }
    if (e.key === '-') {
      heightSlider.value = Math.max(0, state.heightLevel - 1);
      heightSlider.dispatchEvent(new Event('input'));
    }
  });

  // ---- Render Loop ----
  function animate() {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
  }
  animate();

})();
