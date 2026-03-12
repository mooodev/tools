// ============================================================
// RPG Tileset Engine - Three.js based RPG Paper Maker style editor
// Supports: Flat tiles, Blocks, Triangular Prisms, Walls, Lighting
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
    shape: 'tile',        // tile, block, prism, wall
    face: 'top',          // top, front, left
    heightLevel: 0,
    rotation: 0,          // 0, 90, 180, 270 degrees
    tileW: 32,
    tileH: 32,
    showGrid: true,

    // Block dimensions
    blockW: 1,
    blockH: 1,
    blockD: 1,

    // Prism half
    prismHalf: 'left',    // left or right

    // Tileset
    tilesetImage: null,
    tilesetTexture: null,
    tilesetCols: 0,
    tilesetRows: 0,
    selectedTile: null,   // { col, row }

    // Map data: key = "x,z,y,face" -> { col, row, shape, ... }
    mapTiles: {},

    // Three.js tile meshes: same key -> mesh or group
    tileMeshes: {},

    // Rect tool state
    rectStart: null,

    // Hover
    hoverPos: null,

    // Lighting
    userLights: [],       // { id, type, color, intensity, x, y, z, ... }
    nextLightId: 1,
  };

  // ---- Three.js Setup ----
  const canvas = document.getElementById('viewport');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setClearColor(0x1a1a2e);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x1a1a2e, 30, 80);

  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
  camera.position.set(10, 12, 10);
  camera.lookAt(GRID_SIZE / 4, 0, GRID_SIZE / 4);

  // Default lights
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
    frontPlane.position.z = 0;
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

  // ---- UV Helpers ----
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

  function makeTileMaterial() {
    return new THREE.MeshStandardMaterial({
      map: state.tilesetTexture,
      roughness: 0.8,
      metalness: 0.0,
      side: THREE.DoubleSide,
      transparent: true,
      alphaTest: 0.1,
    });
  }

  function setPlaneUV(geometry, uv) {
    const uvAttr = geometry.attributes.uv;
    uvAttr.setXY(0, uv.u0, uv.v1); // top-left
    uvAttr.setXY(1, uv.u1, uv.v1); // top-right
    uvAttr.setXY(2, uv.u0, uv.v0); // bottom-left
    uvAttr.setXY(3, uv.u1, uv.v0); // bottom-right
    uvAttr.needsUpdate = true;
  }

  // ---- 3D Shape Creation Functions ----

  // -- Flat Tile (original) --
  function createFlatTileMesh(key, tileData) {
    const parts = key.split(',');
    const x = parseInt(parts[0]);
    const z = parseInt(parts[1]);
    const y = parseInt(parts[2]);
    const face = parts[3].split('_')[0]; // Extract face from "face_shape_rotation"

    const { col, row } = tileData;
    const uv = getTileUV(col, row);

    const geometry = new THREE.PlaneGeometry(TILE_WORLD_SIZE, TILE_WORLD_SIZE);
    const material = makeTileMaterial();
    const mesh = new THREE.Mesh(geometry, material);

    if (face === 'top') {
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(x + 0.5, y * TILE_WORLD_SIZE + 0.005, z + 0.5);
    } else if (face === 'front') {
      mesh.position.set(x + 0.5, y * TILE_WORLD_SIZE + 0.5, z);
    } else if (face === 'left') {
      mesh.rotation.y = Math.PI / 2;
      mesh.position.set(x, y * TILE_WORLD_SIZE + 0.5, z + 0.5);
    }

    setPlaneUV(geometry, uv);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    scene.add(mesh);
    return mesh;
  }

  // -- Block (Box) -- Textured box with tileable faces
  function createBlockMesh(key, tileData) {
    const parts = key.split(',');
    const x = parseInt(parts[0]);
    const z = parseInt(parts[1]);
    const y = parseInt(parts[2]);

    const { col, row } = tileData;
    const bw = tileData.blockW || 1;
    const bh = tileData.blockH || 1;
    const bd = tileData.blockD || 1;
    const uv = getTileUV(col, row);

    const group = new THREE.Group();

    // Build a box from 6 textured planes (so each face gets the tile texture)
    const faces = [
      // top
      { w: bw, h: bd, pos: [bw / 2, bh, bd / 2], rot: [-Math.PI / 2, 0, 0] },
      // bottom
      { w: bw, h: bd, pos: [bw / 2, 0, bd / 2], rot: [Math.PI / 2, 0, 0] },
      // front (+Z)
      { w: bw, h: bh, pos: [bw / 2, bh / 2, bd], rot: [0, 0, 0] },
      // back (-Z)
      { w: bw, h: bh, pos: [bw / 2, bh / 2, 0], rot: [0, Math.PI, 0] },
      // right (+X)
      { w: bd, h: bh, pos: [bw, bh / 2, bd / 2], rot: [0, Math.PI / 2, 0] },
      // left (-X)
      { w: bd, h: bh, pos: [0, bh / 2, bd / 2], rot: [0, -Math.PI / 2, 0] },
    ];

    faces.forEach(f => {
      // Tile the texture across the face
      const tilesX = Math.ceil(f.w);
      const tilesY = Math.ceil(f.h);

      for (let tx = 0; tx < tilesX; tx++) {
        for (let ty = 0; ty < tilesY; ty++) {
          const pw = Math.min(1, f.w - tx);
          const ph = Math.min(1, f.h - ty);

          const geo = new THREE.PlaneGeometry(pw, ph);
          const mat = makeTileMaterial();
          const plane = new THREE.Mesh(geo, mat);

          // Compute partial UV for edge tiles
          const partialUV = {
            u0: uv.u0,
            u1: uv.u0 + (uv.u1 - uv.u0) * pw,
            v0: uv.v0 + (uv.v1 - uv.v0) * (1 - ph),
            v1: uv.v1,
          };
          setPlaneUV(geo, partialUV);

          // Position within face
          const lx = tx + pw / 2 - f.w / 2;
          const ly = ty + ph / 2 - f.h / 2;
          plane.position.set(lx, ly, 0);

          const faceGroup = new THREE.Group();
          faceGroup.add(plane);
          faceGroup.position.set(f.pos[0], f.pos[1], f.pos[2]);
          faceGroup.rotation.set(f.rot[0], f.rot[1], f.rot[2]);

          plane.castShadow = true;
          plane.receiveShadow = true;

          group.add(faceGroup);
        }
      }
    });

    group.position.set(x, y * TILE_WORLD_SIZE, z);
    scene.add(group);
    return group;
  }

  // -- Triangular Prism (3D triangle) --
  function createPrismMesh(key, tileData) {
    const parts = key.split(',');
    const x = parseInt(parts[0]);
    const z = parseInt(parts[1]);
    const y = parseInt(parts[2]);

    const { col, row } = tileData;
    const rot = (tileData.rotation || 0) * Math.PI / 180;
    const uv = getTileUV(col, row);

    const group = new THREE.Group();

    const w = TILE_WORLD_SIZE;  // width (X)
    const h = TILE_WORLD_SIZE;  // height (Y)
    const d = TILE_WORLD_SIZE;  // depth (Z)

    // Triangle cross-section: base at bottom, apex at top-center
    // Vertices: bottom-left (0,0), bottom-right (w,0), top-center (w/2, h)

    // --- Two triangular end caps (front z=0 and back z=d) ---
    for (let side = 0; side < 2; side++) {
      const triShape = new THREE.Shape();
      triShape.moveTo(0, 0);
      triShape.lineTo(w, 0);
      triShape.lineTo(w / 2, h);
      triShape.lineTo(0, 0);

      const triGeo = new THREE.ShapeGeometry(triShape);
      const triMat = makeTileMaterial();

      // Map UVs to tile
      const triUvAttr = triGeo.attributes.uv;
      for (let i = 0; i < triUvAttr.count; i++) {
        const px = triUvAttr.getX(i) / w;
        const py = triUvAttr.getY(i) / h;
        triUvAttr.setXY(i,
          uv.u0 + (uv.u1 - uv.u0) * px,
          uv.v0 + (uv.v1 - uv.v0) * py
        );
      }
      triUvAttr.needsUpdate = true;

      const triMesh = new THREE.Mesh(triGeo, triMat);
      triMesh.castShadow = true;
      triMesh.receiveShadow = true;

      if (side === 0) {
        triMesh.position.z = 0;
      } else {
        // Back face: flip and position
        triMesh.position.z = d;
        triMesh.rotation.y = Math.PI;
        triMesh.position.x = w;
      }
      group.add(triMesh);
    }

    // --- Bottom face (rectangle) ---
    const bottomGeo = new THREE.PlaneGeometry(w, d);
    const bottomMat = makeTileMaterial();
    const bottomMesh = new THREE.Mesh(bottomGeo, bottomMat);
    setPlaneUV(bottomGeo, uv);
    bottomMesh.rotation.x = Math.PI / 2;
    bottomMesh.position.set(w / 2, 0, d / 2);
    bottomMesh.receiveShadow = true;
    group.add(bottomMesh);

    // --- Left slope face (from bottom-left edge to top-center) ---
    const leftSlopeLen = Math.sqrt((w / 2) * (w / 2) + h * h);
    const leftSlopeGeo = new THREE.PlaneGeometry(leftSlopeLen, d);
    const leftSlopeMat = makeTileMaterial();
    const leftSlopeMesh = new THREE.Mesh(leftSlopeGeo, leftSlopeMat);
    setPlaneUV(leftSlopeGeo, uv);
    leftSlopeMesh.castShadow = true;
    leftSlopeMesh.receiveShadow = true;
    // Angle the slope: rotate around Z to tilt, position at midpoint of left edge
    const slopeAngle = Math.atan2(h, w / 2);
    leftSlopeMesh.rotation.z = slopeAngle - Math.PI / 2;
    leftSlopeMesh.position.set(w / 4, h / 2, d / 2);
    group.add(leftSlopeMesh);

    // --- Right slope face (from bottom-right edge to top-center) ---
    const rightSlopeGeo = new THREE.PlaneGeometry(leftSlopeLen, d);
    const rightSlopeMat = makeTileMaterial();
    const rightSlopeMesh = new THREE.Mesh(rightSlopeGeo, rightSlopeMat);
    setPlaneUV(rightSlopeGeo, uv);
    rightSlopeMesh.castShadow = true;
    rightSlopeMesh.receiveShadow = true;
    rightSlopeMesh.rotation.z = -(slopeAngle - Math.PI / 2);
    rightSlopeMesh.position.set(w * 3 / 4, h / 2, d / 2);
    group.add(rightSlopeMesh);

    // Apply rotation around center
    group.position.set(x, y * TILE_WORLD_SIZE, z);

    if (rot !== 0) {
      const pivot = new THREE.Group();
      pivot.position.set(x + w / 2, y * TILE_WORLD_SIZE, z + d / 2);
      group.position.set(-w / 2, 0, -d / 2);
      pivot.rotation.y = rot;
      pivot.add(group);
      scene.add(pivot);
      return pivot;
    }

    scene.add(group);
    return group;
  }

  // -- Side Plane (rotated 90° plane facing perpendicular direction) --
  function createSidePlaneMesh(key, tileData) {
    const parts = key.split(',');
    const x = parseInt(parts[0]);
    const z = parseInt(parts[1]);
    const y = parseInt(parts[2]);

    const { col, row } = tileData;
    const rot = (tileData.rotation || 0) * Math.PI / 180;
    const uv = getTileUV(col, row);

    const geometry = new THREE.PlaneGeometry(TILE_WORLD_SIZE, TILE_WORLD_SIZE);
    const material = makeTileMaterial();
    const mesh = new THREE.Mesh(geometry, material);

    setPlaneUV(geometry, uv);

    // Default orientation: faces X direction (perpendicular to the wall's default Z-facing)
    mesh.rotation.y = Math.PI / 2 + rot;
    mesh.position.set(x + 0.5, y * TILE_WORLD_SIZE + 0.5, z + 0.5);

    mesh.castShadow = true;
    mesh.receiveShadow = true;

    scene.add(mesh);
    return mesh;
  }

  // -- Wall (90-degree plane) -- Freestanding vertical plane
  function createWallMesh(key, tileData) {
    const parts = key.split(',');
    const x = parseInt(parts[0]);
    const z = parseInt(parts[1]);
    const y = parseInt(parts[2]);

    const { col, row } = tileData;
    const rot = (tileData.rotation || 0) * Math.PI / 180;
    const uv = getTileUV(col, row);

    const geometry = new THREE.PlaneGeometry(TILE_WORLD_SIZE, TILE_WORLD_SIZE);
    const material = makeTileMaterial();
    const mesh = new THREE.Mesh(geometry, material);

    setPlaneUV(geometry, uv);

    // Place vertically centered on the tile
    mesh.position.set(x + 0.5, y * TILE_WORLD_SIZE + 0.5, z + 0.5);
    mesh.rotation.y = rot;

    mesh.castShadow = true;
    mesh.receiveShadow = true;

    scene.add(mesh);
    return mesh;
  }

  // ---- Unified Tile Mesh Creation ----
  function createTileMesh(key, tileData) {
    if (!state.tilesetTexture) return;

    const shape = tileData.shape || 'tile';

    let mesh;
    switch (shape) {
      case 'block':
        mesh = createBlockMesh(key, tileData);
        break;
      case 'prism':
        mesh = createPrismMesh(key, tileData);
        break;
      case 'wall':
        mesh = createWallMesh(key, tileData);
        break;
      case 'sideplane':
        mesh = createSidePlaneMesh(key, tileData);
        break;
      default:
        mesh = createFlatTileMesh(key, tileData);
        break;
    }

    state.tileMeshes[key] = mesh;
  }

  function removeTileMesh(key) {
    const obj = state.tileMeshes[key];
    if (obj) {
      // Dispose recursively
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

  function tileKey(x, z, y, face) {
    return `${x},${z},${y},${face}`;
  }

  function placeTile(x, z) {
    if (!state.selectedTile || !state.tilesetTexture) return;
    if (x < 0 || x >= GRID_SIZE || z < 0 || z >= GRID_SIZE) return;

    const shape = state.shape;
    const face = shape === 'wall' || shape === 'block' || shape === 'prism' || shape === 'sideplane' ? 'top' : state.face;
    const key = tileKey(x, z, state.heightLevel, face + '_' + shape + '_' + state.rotation);

    const data = {
      col: state.selectedTile.col,
      row: state.selectedTile.row,
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

    // Remove existing tile at this position
    removeTileMesh(key);

    state.mapTiles[key] = data;
    createTileMesh(key, data);
    updateTileCount();
  }

  function eraseTile(x, z) {
    if (x < 0 || x >= GRID_SIZE || z < 0 || z >= GRID_SIZE) return;

    // Try to erase any shape at this position
    const shapes = ['tile', 'block', 'prism', 'wall', 'sideplane'];
    const rotations = [0, 90, 180, 270];
    const faces = ['top', 'front', 'left'];

    let erased = false;
    for (const s of shapes) {
      for (const r of rotations) {
        for (const f of faces) {
          const key = tileKey(x, z, state.heightLevel, f + '_' + s + '_' + r);
          if (state.mapTiles[key]) {
            removeTileMesh(key);
            delete state.mapTiles[key];
            erased = true;
          }
        }
      }
    }

    // Also try legacy key format
    const legacyKey = tileKey(x, z, state.heightLevel, state.face);
    if (state.mapTiles[legacyKey]) {
      removeTileMesh(legacyKey);
      delete state.mapTiles[legacyKey];
      erased = true;
    }

    if (erased) updateTileCount();
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

  // ---- Shape Selection ----
  const shapeSelect = document.getElementById('shape-select');
  const blockSizeRow = document.getElementById('block-size-row');
  const prismDirRow = document.getElementById('prism-dir-row');

  function updateShapeUI() {
    blockSizeRow.style.display = state.shape === 'block' ? 'flex' : 'none';
    prismDirRow.style.display = 'none'; // Prism no longer needs half selection
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

  // ============================================================
  // LIGHTING SYSTEM
  // ============================================================

  const lightingPanel = document.getElementById('lighting-panel');
  const lightsList = document.getElementById('lights-list');

  // Light helper visualization objects
  const lightHelpers = {};

  document.getElementById('btn-lighting').addEventListener('click', () => {
    lightingPanel.classList.toggle('visible');
  });

  document.getElementById('btn-close-lighting').addEventListener('click', () => {
    lightingPanel.classList.remove('visible');
  });

  // Ambient light controls
  document.getElementById('ambient-color').addEventListener('input', e => {
    ambientLight.color.set(e.target.value);
  });

  document.getElementById('ambient-intensity').addEventListener('input', e => {
    const val = parseInt(e.target.value) / 100;
    ambientLight.intensity = val;
    document.getElementById('ambient-val').textContent = val.toFixed(1);
  });

  document.getElementById('toggle-shadows').addEventListener('change', e => {
    renderer.shadowMap.enabled = e.target.checked;
    // Need to update all materials
    scene.traverse(child => {
      if (child.material) {
        child.material.needsUpdate = true;
      }
    });
  });

  // Global directional light controls
  document.getElementById('dir-color').addEventListener('input', e => {
    dirLight.color.set(e.target.value);
  });

  document.getElementById('dir-intensity').addEventListener('input', e => {
    const val = parseInt(e.target.value) / 100;
    dirLight.intensity = val;
    document.getElementById('dir-intensity-val').textContent = val.toFixed(1);
  });

  ['dir-x', 'dir-y', 'dir-z'].forEach(id => {
    document.getElementById(id).addEventListener('change', () => {
      dirLight.position.set(
        parseFloat(document.getElementById('dir-x').value),
        parseFloat(document.getElementById('dir-y').value),
        parseFloat(document.getElementById('dir-z').value)
      );
    });
  });

  // Add light buttons
  document.getElementById('btn-add-point').addEventListener('click', () => addLight('point'));
  document.getElementById('btn-add-spot').addEventListener('click', () => addLight('spot'));
  document.getElementById('btn-add-dir').addEventListener('click', () => addLight('directional'));

  function addLight(type, config) {
    const id = state.nextLightId++;
    const lightData = {
      id,
      type,
      color: (config && config.color) || '#ffffff',
      intensity: (config && config.intensity) || 1.0,
      x: (config && config.x) || GRID_SIZE / 4,
      y: (config && config.y) || 5,
      z: (config && config.z) || GRID_SIZE / 4,
      castShadow: (config && config.castShadow !== undefined) ? config.castShadow : true,
      distance: (config && config.distance) || 20,
      angle: (config && config.angle) || 45,
      penumbra: (config && config.penumbra) || 0.3,
      threeLight: null,
      helper: null,
    };

    // Create the Three.js light
    let light;
    switch (type) {
      case 'point':
        light = new THREE.PointLight(lightData.color, lightData.intensity, lightData.distance);
        break;
      case 'spot':
        light = new THREE.SpotLight(lightData.color, lightData.intensity, lightData.distance, lightData.angle * Math.PI / 180, lightData.penumbra);
        light.target.position.set(lightData.x, 0, lightData.z);
        scene.add(light.target);
        break;
      case 'directional':
        light = new THREE.DirectionalLight(lightData.color, lightData.intensity);
        light.shadow.mapSize.set(1024, 1024);
        light.shadow.camera.left = -20;
        light.shadow.camera.right = 20;
        light.shadow.camera.top = 20;
        light.shadow.camera.bottom = -20;
        break;
    }

    light.position.set(lightData.x, lightData.y, lightData.z);
    light.castShadow = lightData.castShadow;

    if (light.shadow) {
      light.shadow.mapSize.set(1024, 1024);
    }

    scene.add(light);
    lightData.threeLight = light;

    // Create helper sphere to visualize the light (clickable/draggable)
    const helperGeo = new THREE.SphereGeometry(0.3, 12, 12);
    const helperMat = new THREE.MeshBasicMaterial({ color: lightData.color });
    const helper = new THREE.Mesh(helperGeo, helperMat);
    helper.position.copy(light.position);
    helper.userData.lightId = id; // Tag for raycasting identification
    scene.add(helper);
    lightData.helper = helper;

    state.userLights.push(lightData);
    renderLightsList();

    return lightData;
  }

  function removeLight(id) {
    const idx = state.userLights.findIndex(l => l.id === id);
    if (idx === -1) return;

    const lightData = state.userLights[idx];

    // Remove Three.js light
    scene.remove(lightData.threeLight);
    if (lightData.threeLight.target) {
      scene.remove(lightData.threeLight.target);
    }
    if (lightData.threeLight.shadow && lightData.threeLight.shadow.map) {
      lightData.threeLight.shadow.map.dispose();
    }
    lightData.threeLight.dispose();

    // Remove helper
    if (lightData.helper) {
      scene.remove(lightData.helper);
      lightData.helper.geometry.dispose();
      lightData.helper.material.dispose();
    }

    state.userLights.splice(idx, 1);
    renderLightsList();
  }

  function updateLight(id, prop, value) {
    const lightData = state.userLights.find(l => l.id === id);
    if (!lightData) return;

    lightData[prop] = value;
    const light = lightData.threeLight;

    switch (prop) {
      case 'color':
        light.color.set(value);
        if (lightData.helper) lightData.helper.material.color.set(value);
        break;
      case 'intensity':
        light.intensity = value;
        break;
      case 'x':
      case 'y':
      case 'z':
        light.position.set(lightData.x, lightData.y, lightData.z);
        if (lightData.helper) lightData.helper.position.copy(light.position);
        if (light.target) light.target.position.set(lightData.x, 0, lightData.z);
        break;
      case 'distance':
        if (light.distance !== undefined) light.distance = value;
        break;
      case 'angle':
        if (light.angle !== undefined) light.angle = value * Math.PI / 180;
        break;
      case 'penumbra':
        if (light.penumbra !== undefined) light.penumbra = value;
        break;
      case 'castShadow':
        light.castShadow = value;
        break;
    }
  }

  function renderLightsList() {
    lightsList.innerHTML = '';

    state.userLights.forEach(lightData => {
      const item = document.createElement('div');
      item.className = 'light-item';

      const typeLabel = lightData.type.charAt(0).toUpperCase() + lightData.type.slice(1);

      item.innerHTML = `
        <div class="light-header">
          <span><strong>${typeLabel} #${lightData.id}</strong></span>
          <button class="btn-small danger" data-remove="${lightData.id}">Del</button>
        </div>
        <div class="light-row">
          <label>Color:</label>
          <input type="color" value="${lightData.color}" data-id="${lightData.id}" data-prop="color">
        </div>
        <div class="light-row">
          <label>Intensity:</label>
          <input type="range" min="0" max="500" value="${Math.round(lightData.intensity * 100)}" data-id="${lightData.id}" data-prop="intensity">
          <span class="intensity-val">${lightData.intensity.toFixed(1)}</span>
        </div>
        <div class="light-row">
          <label>X:</label>
          <input type="number" value="${lightData.x}" step="0.5" data-id="${lightData.id}" data-prop="x">
          <label>Y:</label>
          <input type="number" value="${lightData.y}" step="0.5" data-id="${lightData.id}" data-prop="y">
          <label>Z:</label>
          <input type="number" value="${lightData.z}" step="0.5" data-id="${lightData.id}" data-prop="z">
        </div>
        ${lightData.type === 'point' || lightData.type === 'spot' ? `
        <div class="light-row">
          <label>Distance:</label>
          <input type="range" min="1" max="100" value="${lightData.distance}" data-id="${lightData.id}" data-prop="distance">
          <span>${lightData.distance}</span>
        </div>
        ` : ''}
        ${lightData.type === 'spot' ? `
        <div class="light-row">
          <label>Angle:</label>
          <input type="range" min="5" max="90" value="${lightData.angle}" data-id="${lightData.id}" data-prop="angle">
          <span>${lightData.angle}&deg;</span>
        </div>
        <div class="light-row">
          <label>Penumbra:</label>
          <input type="range" min="0" max="100" value="${Math.round(lightData.penumbra * 100)}" data-id="${lightData.id}" data-prop="penumbra">
          <span>${lightData.penumbra.toFixed(2)}</span>
        </div>
        ` : ''}
        <div class="light-row">
          <label>Shadow:</label>
          <input type="checkbox" ${lightData.castShadow ? 'checked' : ''} data-id="${lightData.id}" data-prop="castShadow">
        </div>
      `;

      lightsList.appendChild(item);
    });

    // Bind events
    lightsList.querySelectorAll('[data-remove]').forEach(btn => {
      btn.addEventListener('click', () => removeLight(parseInt(btn.dataset.remove)));
    });

    lightsList.querySelectorAll('input[data-id]').forEach(input => {
      const id = parseInt(input.dataset.id);
      const prop = input.dataset.prop;

      const handler = () => {
        let value;
        if (input.type === 'checkbox') {
          value = input.checked;
        } else if (input.type === 'color') {
          value = input.value;
        } else if (prop === 'intensity') {
          value = parseInt(input.value) / 100;
          const span = input.nextElementSibling;
          if (span) span.textContent = value.toFixed(1);
        } else if (prop === 'penumbra') {
          value = parseInt(input.value) / 100;
          const span = input.nextElementSibling;
          if (span) span.textContent = value.toFixed(2);
        } else if (prop === 'distance' || prop === 'angle') {
          value = parseInt(input.value);
          const span = input.nextElementSibling;
          if (span) span.textContent = prop === 'angle' ? value + '\u00B0' : value;
        } else {
          value = parseFloat(input.value);
        }
        updateLight(id, prop, value);
      };

      input.addEventListener('input', handler);
      input.addEventListener('change', handler);
    });
  }

  // ---- Light Dragging with Mouse ----
  const lightDragState = {
    active: false,
    lightData: null,
    dragPlane: new THREE.Plane(),
    offset: new THREE.Vector3(),
    intersection: new THREE.Vector3(),
  };

  function getLightHelpers() {
    return state.userLights.map(l => l.helper).filter(Boolean);
  }

  canvas.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    // Check if clicking on a light helper sphere
    const rect = canvas.getBoundingClientRect();
    const mx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const my = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    const rc = new THREE.Raycaster();
    rc.setFromCamera(new THREE.Vector2(mx, my), camera);

    const helpers = getLightHelpers();
    if (helpers.length === 0) return;

    const hits = rc.intersectObjects(helpers);
    if (hits.length > 0) {
      e.stopPropagation();
      e.preventDefault();

      const hitHelper = hits[0].object;
      const lightId = hitHelper.userData.lightId;
      const ld = state.userLights.find(l => l.id === lightId);
      if (!ld) return;

      lightDragState.active = true;
      lightDragState.lightData = ld;

      // Create a drag plane perpendicular to camera at light position
      const camDir = new THREE.Vector3();
      camera.getWorldDirection(camDir);
      lightDragState.dragPlane.setFromNormalAndCoplanarPoint(camDir, hitHelper.position);

      // Calculate offset between intersection point and light position
      rc.ray.intersectPlane(lightDragState.dragPlane, lightDragState.intersection);
      lightDragState.offset.copy(hitHelper.position).sub(lightDragState.intersection);

      canvas.style.cursor = 'grabbing';
    }
  }, true); // Use capture phase to intercept before tile placement

  window.addEventListener('mousemove', e => {
    if (!lightDragState.active) return;

    const rect = canvas.getBoundingClientRect();
    const mx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const my = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    const rc = new THREE.Raycaster();
    rc.setFromCamera(new THREE.Vector2(mx, my), camera);

    const target = new THREE.Vector3();
    if (rc.ray.intersectPlane(lightDragState.dragPlane, target)) {
      target.add(lightDragState.offset);

      const ld = lightDragState.lightData;
      ld.x = Math.round(target.x * 2) / 2; // Snap to 0.5 grid
      ld.y = Math.round(target.y * 2) / 2;
      ld.z = Math.round(target.z * 2) / 2;

      ld.threeLight.position.set(ld.x, ld.y, ld.z);
      ld.helper.position.set(ld.x, ld.y, ld.z);
      if (ld.threeLight.target) {
        ld.threeLight.target.position.set(ld.x, 0, ld.z);
      }

      // Update the UI inputs if lighting panel is open
      renderLightsList();
    }
  });

  window.addEventListener('mouseup', e => {
    if (lightDragState.active) {
      lightDragState.active = false;
      lightDragState.lightData = null;
      canvas.style.cursor = '';
    }
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
    // Serialize lights (without Three.js refs)
    const lightsData = state.userLights.map(l => ({
      type: l.type,
      color: l.color,
      intensity: l.intensity,
      x: l.x,
      y: l.y,
      z: l.z,
      castShadow: l.castShadow,
      distance: l.distance,
      angle: l.angle,
      penumbra: l.penumbra,
    }));

    const data = {
      version: 2,
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

    // Clear user lights
    while (state.userLights.length > 0) {
      removeLight(state.userLights[0].id);
    }

    if (data.tileW) document.getElementById('tile-w').value = data.tileW;
    if (data.tileH) document.getElementById('tile-h').value = data.tileH;

    // Restore lighting
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

    // Restore global directional light
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

    // Restore user lights
    if (data.lights) {
      data.lights.forEach(lconf => addLight(lconf.type, lconf));
    }

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
      case 'l':
        lightingPanel.classList.toggle('visible');
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

    // Rotation with Q/W
    if (e.key.toLowerCase() === 'q') {
      state.rotation = (state.rotation + 270) % 360;
      document.getElementById('rotation-select').value = state.rotation;
    }
    if (e.key.toLowerCase() === 'w') {
      state.rotation = (state.rotation + 90) % 360;
      document.getElementById('rotation-select').value = state.rotation;
    }
  });

  // ---- Render Loop ----
  function animate() {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
  }
  animate();

})();
