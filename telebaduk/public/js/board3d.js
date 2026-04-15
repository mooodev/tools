// Board3D - Three.js renderer with 3D/2D toggle
const Board3D = (() => {
  let scene, camera, renderer, raycaster, mouse;
  let boardGroup, stonesGroup, markersGroup, territoryGroup, influenceGroup;
  let boardSize = 19, cellSize = 1;
  let is3D = false;
  let canvas, container;
  let animationId;
  let orbitAngle = 0, orbitRadius = 20, orbitHeight = 18;
  let targetOrbitAngle, targetOrbitRadius, targetOrbitHeight;
  let isDragging = false, lastTouch = null, pinchDist = 0, activeTouchCount = 0;
  let boardData = null, lastMovePos = null;
  let showInfluence = false, influenceData = null, territoryData = null;
  let deadStones = new Set();
  let scoringMode = false;
  let ghostStone = null;
  let stoneAnimations = [];
  let onIntersect = null;
  let onScoringTap = null;
  let myColor = 1;
  let entranceAnimActive = false, entranceStartTime = 0;
  let dist2D = 20;
  let maxDist2D = 20;
  let minDist2D = 5;

  // Hold-to-place state
  let pendingPlace = null;
  let placeTimer = 0;
  let placeReady = false;
  let suppressInput = false;

  // Abort controller for input cleanup
  let inputAbort = null;

  // Materials
  let boardMat, boardSideMat, blackStoneMat, whiteStoneMat, gridMat, starMat;
  let ghostBlackMat, ghostWhiteMat;
  let lastMoveMat, territoryBlackMat, territoryWhiteMat;
  let deadMarkerMat;

  // Pre-created ghost mesh
  let _ghostMesh = null;

  const STONE_RADIUS = 0.42;
  const STONE_HEIGHT = 0.15;
  const stoneMeshes = new Map();

  function init(canvasEl, containerEl, size) {
    // Cleanup previous instance
    if (animationId) { cancelAnimationFrame(animationId); animationId = null; }
    if (renderer) renderer.dispose();
    if (inputAbort) inputAbort.abort();
    stoneMeshes.clear();
    stoneAnimations = [];
    entranceAnimActive = false;
    pendingPlace = null;
    placeReady = false;
    suppressInput = false;
    ghostStone = null;
    _ghostMesh = null;

    canvas = canvasEl;
    container = containerEl;
    boardSize = size;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a1a);

    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();

    // Lights - pleasant soft shadows
    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambient);

    const dirLight = new THREE.DirectionalLight(0xfff5e0, 0.55);
    dirLight.position.set(4, 20, 6);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.set(2048, 2048);
    dirLight.shadow.camera.near = 1;
    dirLight.shadow.camera.far = 50;
    const se = boardSize * 0.7;
    dirLight.shadow.camera.left = -se;
    dirLight.shadow.camera.right = se;
    dirLight.shadow.camera.top = se;
    dirLight.shadow.camera.bottom = -se;
    dirLight.shadow.bias = -0.0008;
    dirLight.shadow.normalBias = 0.02;
    dirLight.shadow.radius = 4;
    scene.add(dirLight);

    const pointLight = new THREE.PointLight(0xffeedd, 0.2, 40);
    pointLight.position.set(-3, 12, -3);
    scene.add(pointLight);

    // Materials
    const tl = new THREE.TextureLoader();
    const woodTex = tl.load('https://raw.githubusercontent.com/mooodev/tools/refs/heads/main/images/kayawood.webp');
    woodTex.wrapS = THREE.RepeatWrapping;
    woodTex.wrapT = THREE.RepeatWrapping;
    boardMat = new THREE.MeshLambertMaterial({ map: woodTex });
    boardSideMat = new THREE.MeshLambertMaterial({ color: 0xa07030 });

    // Black stones with dragon texture
    const dragonTex = tl.load('https://raw.githubusercontent.com/mooodev/tools/refs/heads/main/images/dragonTexture.jpg');
    dragonTex.wrapS = THREE.RepeatWrapping;
    dragonTex.wrapT = THREE.RepeatWrapping;
    blackStoneMat = new THREE.MeshPhongMaterial({
      map: dragonTex, color: 0x333333, specular: 0x555555, shininess: 70
    });

    // White stones - glassy/transparent
    whiteStoneMat = new THREE.MeshPhongMaterial({
      color: 0xf4f0e8, specular: 0xffffff, shininess: 140,
      transparent: true, opacity: 0.82
    });

    ghostBlackMat = new THREE.MeshPhongMaterial({ color: 0x1a1a1a, transparent: true, opacity: 0.3 });
    ghostWhiteMat = new THREE.MeshPhongMaterial({ color: 0xf0ead6, transparent: true, opacity: 0.3 });
    gridMat = new THREE.LineBasicMaterial({ color: 0x3d2b1f });
    starMat = new THREE.MeshBasicMaterial({ color: 0x3d2b1f });
    lastMoveMat = new THREE.MeshBasicMaterial({ color: 0xffcc44, transparent: true, opacity: 0.8 });
    territoryBlackMat = new THREE.MeshBasicMaterial({ color: 0x222222, transparent: true, opacity: 0.4 });
    territoryWhiteMat = new THREE.MeshBasicMaterial({ color: 0xf0ead6, transparent: true, opacity: 0.35 });
    deadMarkerMat = new THREE.MeshBasicMaterial({ color: 0xff3333, transparent: true, opacity: 0.7 });

    boardGroup = new THREE.Group();
    stonesGroup = new THREE.Group();
    markersGroup = new THREE.Group();
    territoryGroup = new THREE.Group();
    influenceGroup = new THREE.Group();
    scene.add(boardGroup);
    scene.add(stonesGroup);
    scene.add(markersGroup);
    scene.add(territoryGroup);
    scene.add(influenceGroup);

    buildBoard();
    resize();
    resetCamera2D();
    setupInput();
    animate();
  }

  function buildBoard() {
    boardGroup.clear();
    const half = (boardSize - 1) / 2;
    const bw = boardSize + 0.8;
    const boardGeo = new THREE.BoxGeometry(bw, 1.5, bw);
    const boardMesh = new THREE.Mesh(boardGeo, [
      boardSideMat, boardSideMat, boardMat, boardSideMat, boardSideMat, boardSideMat
    ]);
    boardMesh.position.set(half, -0.75, half);
    boardMesh.receiveShadow = true;
    boardGroup.add(boardMesh);

    const lineGeo = new THREE.BufferGeometry();
    const verts = [];
    for (let i = 0; i < boardSize; i++) {
      verts.push(i, 0.001, 0, i, 0.001, boardSize - 1);
      verts.push(0, 0.001, i, boardSize - 1, 0.001, i);
    }
    lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    boardGroup.add(new THREE.LineSegments(lineGeo, gridMat));

    const stars = getStarPoints(boardSize);
    const starGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.02, 12);
    for (const [sx, sy] of stars) {
      const star = new THREE.Mesh(starGeo, starMat);
      star.position.set(sx, 0.01, sy);
      boardGroup.add(star);
    }
  }

  function getStarPoints(size) {
    if (size === 9) return [[2,2],[6,2],[4,4],[2,6],[6,6]];
    if (size === 13) return [[3,3],[9,3],[6,6],[3,9],[9,9]];
    return [[3,3],[9,3],[15,3],[3,9],[9,9],[15,9],[3,15],[9,15],[15,15]];
  }

  function calcDist2D() {
    const boardExtent = boardSize + 1;
    const halfFOV = (camera.fov * Math.PI / 180) / 2;
    const aspect = camera.aspect || 1;
    const dV = (boardExtent / 2) / Math.tan(halfFOV);
    const dH = (boardExtent / 2) / (Math.tan(halfFOV) * aspect);
    maxDist2D = Math.max(dV, dH) * 1.05;
    minDist2D = maxDist2D * 0.3;
    dist2D = maxDist2D;
  }

  function resetCamera2D() {
    is3D = false;
    const half = (boardSize - 1) / 2;
    calcDist2D();
    targetOrbitAngle = 0;
    targetOrbitRadius = 0;
    targetOrbitHeight = dist2D;
    camera.position.set(half, dist2D, half);
    camera.lookAt(half, 0, half);
    camera.up.set(0, 0, -1);
  }

  function resetCamera3D() {
    is3D = true;
    const half = (boardSize - 1) / 2;
    orbitAngle = Math.PI * 0.15;
    orbitRadius = boardSize * 0.8;
    orbitHeight = boardSize * 0.6;
    targetOrbitAngle = orbitAngle;
    targetOrbitRadius = orbitRadius;
    targetOrbitHeight = orbitHeight;
    camera.up.set(0, 1, 0);
  }

  function toggle3D() {
    if (is3D) resetCamera2D();
    else resetCamera3D();
    return is3D;
  }

  function resize() {
    if (!container || !renderer) return;
    const w = container.clientWidth;
    const h = container.clientHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    calcDist2D();
  }

  function setupInput() {
    if (inputAbort) inputAbort.abort();
    inputAbort = new AbortController();
    const sig = { signal: inputAbort.signal };
    let touchStartPos = null;

    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') {
        touchStartPos = { x: e.clientX, y: e.clientY };
      }
      if (is3D && activeTouchCount < 2) {
        isDragging = true;
        lastTouch = { x: e.clientX, y: e.clientY };
      }
      // Hold-to-place: start tracking
      if (activeTouchCount < 2 && !suppressInput) {
        const pos = screenToBoard(e.clientX, e.clientY);
        if (pos && boardData && boardData[pos.y][pos.x] === 0 && !scoringMode) {
          pendingPlace = pos;
          placeTimer = Date.now();
          placeReady = false;
          Haptics.gridSnap();
          ghostStone = { x: pos.x, y: pos.y, color: myColor };
        } else {
          pendingPlace = null;
          ghostStone = null;
        }
      }
    }, sig);

    canvas.addEventListener('pointermove', (e) => {
      if (is3D && isDragging && lastTouch && activeTouchCount < 2) {
        const dx = e.clientX - lastTouch.x;
        const dy = e.clientY - lastTouch.y;
        orbitAngle -= dx * 0.008;
        orbitHeight = Math.max(3, Math.min(boardSize * 1.2, orbitHeight - dy * 0.08));
        targetOrbitAngle = orbitAngle;
        targetOrbitHeight = orbitHeight;
        lastTouch = { x: e.clientX, y: e.clientY };
        return;
      }
      // Update pending place position with grid haptics
      if (activeTouchCount < 2 && !suppressInput) {
        const pos = screenToBoard(e.clientX, e.clientY);
        if (pos && boardData && boardData[pos.y][pos.x] === 0 && !scoringMode) {
          if (!pendingPlace || pos.x !== pendingPlace.x || pos.y !== pendingPlace.y) {
            pendingPlace = pos;
            placeTimer = Date.now();
            placeReady = false;
            Haptics.gridSnap();
          }
          ghostStone = { x: pos.x, y: pos.y, color: myColor };
        } else {
          pendingPlace = null;
          ghostStone = null;
        }
      }
    }, sig);

    canvas.addEventListener('pointerup', (e) => {
      isDragging = false;
      lastTouch = null;
      const moved = touchStartPos ?
        Math.hypot(e.clientX - touchStartPos.x, e.clientY - touchStartPos.y) : 0;

      if (scoringMode && moved < 15) {
        const pos = screenToBoard(e.clientX, e.clientY);
        if (pos && onScoringTap) onScoringTap(pos.x, pos.y);
      } else if (pendingPlace && placeReady && activeTouchCount < 2) {
        if (onIntersect) onIntersect(pendingPlace.x, pendingPlace.y);
      }

      pendingPlace = null;
      placeReady = false;
      ghostStone = null;
      touchStartPos = null;
    }, sig);

    // Pinch zoom - works in BOTH 2D and 3D
    canvas.addEventListener('touchstart', (e) => {
      activeTouchCount = e.touches.length;
      if (activeTouchCount >= 2) {
        pendingPlace = null;
        placeReady = false;
        ghostStone = null;
        isDragging = false;
        pinchDist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        e.preventDefault();
      }
    }, { ...sig, passive: false });

    canvas.addEventListener('touchmove', (e) => {
      if (e.touches.length >= 2) e.preventDefault();
      if (e.touches.length === 2 && pinchDist > 0) {
        const d = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        const scale = pinchDist / d;
        if (is3D) {
          orbitRadius = Math.max(boardSize * 0.4, Math.min(boardSize * 1.5, orbitRadius * scale));
          targetOrbitRadius = orbitRadius;
        } else {
          dist2D = Math.max(minDist2D, Math.min(maxDist2D, dist2D * scale));
        }
        pinchDist = d;
      }
    }, { ...sig, passive: false });

    canvas.addEventListener('wheel', (e) => {
      if (is3D) {
        orbitRadius = Math.max(boardSize * 0.4, Math.min(boardSize * 1.5, orbitRadius + e.deltaY * 0.02));
        targetOrbitRadius = orbitRadius;
      } else {
        dist2D = Math.max(minDist2D, Math.min(maxDist2D, dist2D + e.deltaY * 0.02));
      }
    }, { ...sig, passive: true });

    canvas.addEventListener('touchend', (e) => {
      activeTouchCount = e.touches.length;
      if (activeTouchCount < 2) pinchDist = 0;
    }, sig);

    canvas.addEventListener('touchcancel', () => {
      activeTouchCount = 0;
      pinchDist = 0;
      pendingPlace = null;
      placeReady = false;
      ghostStone = null;
    }, sig);
  }

  function screenToBoard(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const intersect = new THREE.Vector3();
    raycaster.ray.intersectPlane(plane, intersect);
    if (!intersect) return null;
    const bx = Math.round(intersect.x);
    const by = Math.round(intersect.z);
    if (bx < 0 || bx >= boardSize || by < 0 || by >= boardSize) return null;
    return { x: bx, y: by };
  }

  // ─── STONE MANAGEMENT ───
  function addStone(x, y, color, animated = true) {
    const key = `${x},${y}`;
    if (stoneMeshes.has(key)) return;
    const geo = new THREE.SphereGeometry(STONE_RADIUS, 24, 16);
    geo.scale(1, 0.35, 1);
    const mat = color === 1 ? blackStoneMat : whiteStoneMat;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.position.set(x, STONE_HEIGHT, y);

    if (animated) {
      mesh.position.y = STONE_HEIGHT + 1.0;
      stoneAnimations.push({
        mesh, startTime: performance.now(), duration: 150, type: 'slam'
      });
      rattleNearby(x, y);
    }

    stonesGroup.add(mesh);
    stoneMeshes.set(key, mesh);
  }

  function rattleNearby(px, py) {
    const now = performance.now();
    for (const [key, mesh] of stoneMeshes) {
      const [sx, sy] = key.split(',').map(Number);
      if (sx === px && sy === py) continue;
      const d = Math.hypot(sx - px, sy - py);
      if (d > 3.5) continue;
      stoneAnimations = stoneAnimations.filter(a => !(a.type === 'rattle' && a.mesh === mesh));
      const amplitude = Math.max(0, 1 - d / 4);
      stoneAnimations.push({
        mesh, startTime: now, duration: 300, type: 'rattle',
        baseX: sx, baseZ: sy, amplitude, phase: Math.random() * Math.PI * 2
      });
    }
  }

  function removeStone(x, y, animated = true) {
    const key = `${x},${y}`;
    const mesh = stoneMeshes.get(key);
    if (!mesh) return;
    if (animated) {
      stoneAnimations.push({
        mesh, startTime: performance.now(), duration: 400, type: 'capture',
        fromScale: 1, toScale: 0
      });
      stoneMeshes.delete(key);
    } else {
      stonesGroup.remove(mesh);
      mesh.geometry.dispose();
      stoneMeshes.delete(key);
    }
  }

  function clearStones() {
    for (const [, mesh] of stoneMeshes) {
      stonesGroup.remove(mesh);
      mesh.geometry.dispose();
    }
    stoneMeshes.clear();
  }

  // ─── MARKERS ───
  function updateMarkers(lastMove, atariGroups) {
    markersGroup.clear();
    if (lastMove && lastMove.x !== undefined) {
      const ringGeo = new THREE.RingGeometry(0.2, 0.28, 24);
      ringGeo.rotateX(-Math.PI / 2);
      const ring = new THREE.Mesh(ringGeo, lastMoveMat);
      ring.position.set(lastMove.x, STONE_HEIGHT + 0.06, lastMove.y);
      markersGroup.add(ring);
    }
    if (scoringMode) {
      const crossGeo = new THREE.PlaneGeometry(0.4, 0.08);
      crossGeo.rotateX(-Math.PI / 2);
      for (const key of deadStones) {
        const [dx, dy] = key.split(',').map(Number);
        const c1 = new THREE.Mesh(crossGeo.clone(), deadMarkerMat);
        c1.position.set(dx, STONE_HEIGHT + 0.07, dy);
        c1.rotation.y = Math.PI / 4;
        markersGroup.add(c1);
        const c2 = new THREE.Mesh(crossGeo.clone(), deadMarkerMat);
        c2.position.set(dx, STONE_HEIGHT + 0.07, dy);
        c2.rotation.y = -Math.PI / 4;
        markersGroup.add(c2);
      }
    }
  }

  // ─── TERRITORY OVERLAY ───
  function updateTerritory(terr) {
    territoryData = terr;
    territoryGroup.clear();
    if (!terr) return;
    const geo = new THREE.PlaneGeometry(0.6, 0.6);
    geo.rotateX(-Math.PI / 2);
    for (let y = 0; y < boardSize; y++) {
      for (let x = 0; x < boardSize; x++) {
        if (boardData && boardData[y][x] !== 0) continue;
        const val = terr[y][x];
        if (val === 1) {
          const m = new THREE.Mesh(geo.clone(), territoryBlackMat);
          m.position.set(x, 0.005, y);
          territoryGroup.add(m);
        } else if (val === 2) {
          const m = new THREE.Mesh(geo.clone(), territoryWhiteMat);
          m.position.set(x, 0.005, y);
          territoryGroup.add(m);
        }
      }
    }
  }

  // ─── INFLUENCE OVERLAY ───
  function updateInfluenceOverlay(infMap) {
    influenceGroup.clear();
    if (!infMap || !showInfluence) return;
    const geo = new THREE.PlaneGeometry(0.8, 0.8);
    geo.rotateX(-Math.PI / 2);
    for (let y = 0; y < boardSize; y++) {
      for (let x = 0; x < boardSize; x++) {
        if (boardData && boardData[y][x] !== 0) continue;
        const v = infMap[y][x];
        if (Math.abs(v) < 0.15) continue;
        const alpha = Math.min(0.45, Math.abs(v) * 0.5);
        const col = v > 0 ? 0x222222 : 0xe8dcc0;
        const mat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: alpha });
        const m = new THREE.Mesh(geo.clone(), mat);
        m.position.set(x, 0.003, y);
        influenceGroup.add(m);
      }
    }
  }

  // ─── FULL BOARD SYNC ───
  function syncBoard(board, opts = {}) {
    boardData = board;
    if (opts.myColor) myColor = opts.myColor;
    if (opts.lastMove !== undefined) lastMovePos = opts.lastMove;
    if (opts.scoringMode !== undefined) scoringMode = opts.scoringMode;
    if (opts.deadStones) {
      deadStones = new Set(opts.deadStones.map(([x, y]) => `${x},${y}`));
    }

    const newKeys = new Set();
    for (let y = 0; y < boardSize; y++) {
      for (let x = 0; x < boardSize; x++) {
        const val = board[y][x];
        if (val !== 0) {
          const key = `${x},${y}`;
          newKeys.add(key);
          if (!stoneMeshes.has(key)) addStone(x, y, val, false);
        }
      }
    }
    for (const [key] of stoneMeshes) {
      if (!newKeys.has(key)) {
        const [x, y] = key.split(',').map(Number);
        removeStone(x, y, false);
      }
    }
    updateMarkers(lastMovePos);
    if (opts.territory) updateTerritory(opts.territory);
  }

  // ─── ENTRANCE ANIMATION - Fast Rain Drop ───
  function playEntranceAnimation() {
    entranceAnimActive = true;
    entranceStartTime = performance.now();
    suppressInput = true;

    const now = performance.now();
    const keys = Array.from(stoneMeshes.keys());
    const spread = Math.min(500, keys.length * 8);

    for (let i = 0; i < keys.length; i++) {
      const mesh = stoneMeshes.get(keys[i]);
      if (!mesh) continue;
      const [sx, sy] = keys[i].split(',').map(Number);
      const delay = Math.random() * spread;
      const startY = STONE_HEIGHT + 2.5 + Math.random() * 1.5;
      mesh.position.y = startY;

      stoneAnimations.push({
        mesh, startTime: now + delay, duration: 100, type: 'rainDrop',
        targetY: STONE_HEIGHT, startY, baseX: sx, baseZ: sy
      });
    }

    setTimeout(() => {
      entranceAnimActive = false;
      suppressInput = false;
      for (const [key, mesh] of stoneMeshes) {
        const [sx, sy] = key.split(',').map(Number);
        mesh.position.set(sx, STONE_HEIGHT, sy);
        mesh.scale.set(1, 1, 1);
      }
    }, spread + 200);
  }

  // ─── ANIMATION LOOP ───
  function animate() {
    animationId = requestAnimationFrame(animate);
    const now = performance.now();

    // Camera
    if (is3D) {
      const half = (boardSize - 1) / 2;
      const cx = half + Math.sin(orbitAngle) * orbitRadius;
      const cz = half + Math.cos(orbitAngle) * orbitRadius;
      camera.position.lerp(new THREE.Vector3(cx, orbitHeight, cz), 0.12);
      camera.lookAt(half, 0, half);
    } else {
      const half = (boardSize - 1) / 2;
      camera.position.lerp(new THREE.Vector3(half, dist2D, half), 0.12);
      camera.lookAt(half, 0, half);
      camera.up.set(0, 0, -1);
    }

    // Hold-to-place timer
    if (pendingPlace && !placeReady && Date.now() - placeTimer >= 500) {
      placeReady = true;
      Haptics.confirmReady();
    }

    // Stone animations
    for (let i = stoneAnimations.length - 1; i >= 0; i--) {
      const a = stoneAnimations[i];
      if (now < a.startTime) continue;
      const t = Math.min(1, (now - a.startTime) / a.duration);

      if (a.type === 'slam') {
        if (t < 0.3) {
          const dt = t / 0.3;
          a.mesh.position.y = STONE_HEIGHT + 1.0 * (1 - dt * dt * dt);
        } else if (t < 0.55) {
          const it = (t - 0.3) / 0.25;
          const sq = Math.sin(it * Math.PI);
          a.mesh.position.y = STONE_HEIGHT;
          a.mesh.scale.set(1 + 0.2 * sq, 1 - 0.35 * sq, 1 + 0.2 * sq);
        } else {
          const st = (t - 0.55) / 0.45;
          const b = Math.sin(st * Math.PI) * 0.04 * (1 - st);
          a.mesh.position.y = STONE_HEIGHT + b;
          a.mesh.scale.set(1, 1, 1);
        }
      }

      if (a.type === 'rainDrop') {
        const dt = t * t * t;
        a.mesh.position.y = a.startY + (a.targetY - a.startY) * dt;
        if (t >= 0.85) {
          const it = (t - 0.85) / 0.15;
          const sq = Math.sin(it * Math.PI);
          a.mesh.scale.set(1 + 0.06 * sq, 1 - 0.12 * sq, 1 + 0.06 * sq);
        }
        if (t >= 1) {
          a.mesh.position.set(a.baseX, STONE_HEIGHT, a.baseZ);
          a.mesh.scale.set(1, 1, 1);
        }
      }

      if (a.type === 'rattle') {
        const decay = (1 - t) * (1 - t);
        const freq = 40;
        a.mesh.position.y = STONE_HEIGHT + Math.sin(t * freq + a.phase) * a.amplitude * 0.06 * decay;
        a.mesh.position.x = a.baseX + Math.sin(t * freq * 1.3 + a.phase) * a.amplitude * 0.04 * decay;
        a.mesh.position.z = a.baseZ + Math.cos(t * freq * 0.9 + a.phase * 0.7) * a.amplitude * 0.04 * decay;
        if (t >= 1) a.mesh.position.set(a.baseX, STONE_HEIGHT, a.baseZ);
      }

      if (a.type === 'capture') {
        const s = a.fromScale * (1 - t);
        a.mesh.scale.set(s, s, s);
        a.mesh.position.y = STONE_HEIGHT + Math.sin(t * Math.PI) * 0.8;
        a.mesh.rotation.x = t * Math.PI * 2;
        if (t >= 1) {
          stonesGroup.remove(a.mesh);
          a.mesh.geometry.dispose();
        }
      }

      if (t >= 1) stoneAnimations.splice(i, 1);
    }

    renderGhostStone();
    renderer.render(scene, camera);
  }

  // Optimized ghost stone - reuse mesh
  function renderGhostStone() {
    if (suppressInput || !ghostStone || scoringMode || entranceAnimActive) {
      if (_ghostMesh) _ghostMesh.visible = false;
      return;
    }
    if (!_ghostMesh) {
      const geo = new THREE.SphereGeometry(STONE_RADIUS, 24, 16);
      geo.scale(1, 0.35, 1);
      _ghostMesh = new THREE.Mesh(geo, ghostBlackMat);
      _ghostMesh.visible = false;
      stonesGroup.add(_ghostMesh);
    }
    _ghostMesh.material = ghostStone.color === 1 ? ghostBlackMat : ghostWhiteMat;
    _ghostMesh.position.set(ghostStone.x, STONE_HEIGHT, ghostStone.y);
    _ghostMesh.visible = true;
    if (placeReady) {
      const pulse = 1 + Math.sin(performance.now() * 0.008) * 0.05;
      _ghostMesh.scale.set(pulse, pulse, pulse);
    } else {
      _ghostMesh.scale.set(1, 1, 1);
    }
  }

  function setSize(size) {
    boardSize = size;
    boardGroup.clear();
    clearStones();
    markersGroup.clear();
    territoryGroup.clear();
    influenceGroup.clear();
    buildBoard();
    if (is3D) resetCamera3D(); else resetCamera2D();
  }

  function setShowInfluence(val) {
    showInfluence = val;
    if (!val) influenceGroup.clear();
  }

  function setScoringMode(val) { scoringMode = val; }
  function setDeadStones(ds) {
    deadStones = new Set(ds.map(([x, y]) => `${x},${y}`));
    updateMarkers(lastMovePos);
  }

  function destroy() {
    if (animationId) cancelAnimationFrame(animationId);
    if (inputAbort) inputAbort.abort();
    if (renderer) renderer.dispose();
  }

  return {
    init, resize, toggle3D, syncBoard, addStone, removeStone, clearStones,
    updateMarkers, updateTerritory, updateInfluenceOverlay,
    setSize, setShowInfluence, setScoringMode, setDeadStones,
    playEntranceAnimation, destroy,
    get is3D() { return is3D; },
    set onIntersect(fn) { onIntersect = fn; },
    set onScoringTap(fn) { onScoringTap = fn; },
    set myColor(c) { myColor = c; },
    get scene() { return scene; },
    get stonesGroup() { return stonesGroup; }
  };
})();
