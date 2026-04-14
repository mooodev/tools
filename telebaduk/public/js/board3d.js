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
  let ghostStone = null; // { x, y, color }
  let stoneAnimations = []; // { mesh, startTime, duration, type, ... }
  let onIntersect = null; // callback(x, y)
  let onScoringTap = null;
  let myColor = 1;
  let entranceAnimActive = false, entranceStartTime = 0;
  let dist2D = 20;

  // Materials
  let boardMat, blackStoneMat, whiteStoneMat, gridMat, starMat;
  let ghostBlackMat, ghostWhiteMat;
  let lastMoveMat, territoryBlackMat, territoryWhiteMat;
  let deadMarkerMat;

  const STONE_RADIUS = 0.42;
  const STONE_HEIGHT = 0.15;

  function init(canvasEl, containerEl, size) {
    canvas = canvasEl;
    container = containerEl;
    boardSize = size;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a1a);

    // Renderer
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Camera
    camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);

    // Raycaster
    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();

    // Lights
    const ambient = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambient);

    const dirLight = new THREE.DirectionalLight(0xfff5e0, 0.7);
    dirLight.position.set(5, 15, 8);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.set(1024, 1024);
    dirLight.shadow.camera.near = 1;
    dirLight.shadow.camera.far = 40;
    dirLight.shadow.camera.left = -12;
    dirLight.shadow.camera.right = 12;
    dirLight.shadow.camera.top = 12;
    dirLight.shadow.camera.bottom = -12;
    scene.add(dirLight);

    const pointLight = new THREE.PointLight(0xffeedd, 0.3, 30);
    pointLight.position.set(-5, 10, -5);
    scene.add(pointLight);

    // Materials
    boardMat = new THREE.MeshLambertMaterial({ color: 0xc8956c });
    blackStoneMat = new THREE.MeshPhongMaterial({
      color: 0x1a1a1a, specular: 0x444444, shininess: 60
    });
    whiteStoneMat = new THREE.MeshPhongMaterial({
      color: 0xf0ead6, specular: 0xffffff, shininess: 80
    });
    ghostBlackMat = new THREE.MeshPhongMaterial({
      color: 0x1a1a1a, transparent: true, opacity: 0.35
    });
    ghostWhiteMat = new THREE.MeshPhongMaterial({
      color: 0xf0ead6, transparent: true, opacity: 0.35
    });
    gridMat = new THREE.LineBasicMaterial({ color: 0x3d2b1f });
    starMat = new THREE.MeshBasicMaterial({ color: 0x3d2b1f });
    lastMoveMat = new THREE.MeshBasicMaterial({ color: 0xffcc44, transparent: true, opacity: 0.8 });
    territoryBlackMat = new THREE.MeshBasicMaterial({ color: 0x222222, transparent: true, opacity: 0.4 });
    territoryWhiteMat = new THREE.MeshBasicMaterial({ color: 0xf0ead6, transparent: true, opacity: 0.35 });
    deadMarkerMat = new THREE.MeshBasicMaterial({ color: 0xff3333, transparent: true, opacity: 0.7 });

    // Groups
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

    // Board plane
    const bw = boardSize + 0.8;
    const boardGeo = new THREE.BoxGeometry(bw, 0.3, bw);
    const boardMesh = new THREE.Mesh(boardGeo, boardMat);
    boardMesh.position.set(half, -0.15, half);
    boardMesh.receiveShadow = true;
    boardGroup.add(boardMesh);

    // Grid lines
    const lineGeo = new THREE.BufferGeometry();
    const verts = [];
    for (let i = 0; i < boardSize; i++) {
      verts.push(i, 0.001, 0, i, 0.001, boardSize - 1);
      verts.push(0, 0.001, i, boardSize - 1, 0.001, i);
    }
    lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    const lines = new THREE.LineSegments(lineGeo, gridMat);
    boardGroup.add(lines);

    // Star points
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
    dist2D = Math.max(dV, dH) * 1.05;
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
    let touchStartTime = 0;
    let touchStartPos = null;

    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') {
        touchStartTime = Date.now();
        touchStartPos = { x: e.clientX, y: e.clientY };
      }
      if (is3D && activeTouchCount < 2) {
        isDragging = true;
        lastTouch = { x: e.clientX, y: e.clientY };
      }
    });

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
      // Hover ghost stone (non-3d)
      updateGhostFromEvent(e);
    });

    canvas.addEventListener('pointerup', (e) => {
      isDragging = false;
      lastTouch = null;
      const moved = touchStartPos ?
        Math.hypot(e.clientX - touchStartPos.x, e.clientY - touchStartPos.y) : 0;

      if (moved < 15) {
        handleTap(e);
      }
      touchStartPos = null;
    });

    // Pinch zoom for 3D
    canvas.addEventListener('touchstart', (e) => {
      activeTouchCount = e.touches.length;
      if (activeTouchCount === 2) {
        isDragging = false;
        pinchDist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        e.preventDefault();
      }
    }, { passive: false });

    canvas.addEventListener('touchmove', (e) => {
      if (e.touches.length >= 2) e.preventDefault();
      if (!is3D) return;
      if (e.touches.length === 2 && pinchDist > 0) {
        const dist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        const scale = pinchDist / dist;
        orbitRadius = Math.max(boardSize * 0.4, Math.min(boardSize * 1.5, orbitRadius * scale));
        targetOrbitRadius = orbitRadius;
        pinchDist = dist;
      }
    }, { passive: false });

    canvas.addEventListener('wheel', (e) => {
      if (!is3D) return;
      orbitRadius = Math.max(boardSize * 0.4, Math.min(boardSize * 1.5, orbitRadius + e.deltaY * 0.02));
      targetOrbitRadius = orbitRadius;
    }, { passive: true });

    canvas.addEventListener('touchend', (e) => {
      activeTouchCount = e.touches.length;
      if (activeTouchCount < 2) pinchDist = 0;
    });

    canvas.addEventListener('touchcancel', () => {
      activeTouchCount = 0;
      pinchDist = 0;
    });
  }

  function screenToBoard(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);

    // Intersect with y=0 plane
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const intersect = new THREE.Vector3();
    raycaster.ray.intersectPlane(plane, intersect);
    if (!intersect) return null;

    const bx = Math.round(intersect.x);
    const by = Math.round(intersect.z);
    if (bx < 0 || bx >= boardSize || by < 0 || by >= boardSize) return null;
    return { x: bx, y: by };
  }

  function updateGhostFromEvent(e) {
    const pos = screenToBoard(e.clientX, e.clientY);
    if (pos && boardData && boardData[pos.y][pos.x] === 0) {
      ghostStone = { x: pos.x, y: pos.y, color: myColor };
    } else {
      ghostStone = null;
    }
  }

  function handleTap(e) {
    const pos = screenToBoard(e.clientX, e.clientY);
    if (!pos) return;
    if (scoringMode && onScoringTap) {
      onScoringTap(pos.x, pos.y);
      return;
    }
    if (onIntersect) onIntersect(pos.x, pos.y);
    ghostStone = null;
  }

  // ─── STONE MANAGEMENT ───
  const stoneMeshes = new Map(); // "x,y" -> mesh

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
      mesh.scale.set(0, 0, 0);
      stoneAnimations.push({
        mesh, startTime: performance.now(), duration: 350, type: 'place',
        fromScale: 0, toScale: 1
      });
    }

    stonesGroup.add(mesh);
    stoneMeshes.set(key, mesh);
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

    // Last move marker
    if (lastMove && lastMove.x !== undefined) {
      const ringGeo = new THREE.RingGeometry(0.2, 0.28, 24);
      ringGeo.rotateX(-Math.PI / 2);
      const ring = new THREE.Mesh(ringGeo, lastMoveMat);
      ring.position.set(lastMove.x, STONE_HEIGHT + 0.06, lastMove.y);
      markersGroup.add(ring);
    }

    // Dead stone markers (scoring mode)
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

    // Diff stones
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
    // Remove stones not in new board
    for (const [key] of stoneMeshes) {
      if (!newKeys.has(key)) {
        const [x, y] = key.split(',').map(Number);
        removeStone(x, y, false);
      }
    }

    updateMarkers(lastMovePos);
    if (opts.territory) updateTerritory(opts.territory);
  }

  // ─── ENTRANCE ANIMATION (sin/cos/log) ───
  function playEntranceAnimation() {
    entranceAnimActive = true;
    entranceStartTime = performance.now();
  }

  // ─── ANIMATION LOOP ───
  function animate() {
    animationId = requestAnimationFrame(animate);
    const now = performance.now();

    // Camera smoothing
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

    // Stone animations
    for (let i = stoneAnimations.length - 1; i >= 0; i--) {
      const a = stoneAnimations[i];
      const t = Math.min(1, (now - a.startTime) / a.duration);

      if (a.type === 'place') {
        // Elastic ease: sin wave with log decay
        const ease = t < 1 ?
          1 - Math.cos(t * Math.PI * 2.5) * Math.exp(-t * 4) * (1 - t) :
          1;
        const s = a.fromScale + (a.toScale - a.fromScale) * Math.min(1, t + ease * 0.3);
        const finalS = Math.max(0, Math.min(1.15, s));
        a.mesh.scale.set(finalS, finalS, finalS);
        // Subtle bounce height
        a.mesh.position.y = STONE_HEIGHT + Math.sin(t * Math.PI) * 0.3 * (1 - t);
      }

      if (a.type === 'capture') {
        // Shrink + rise + spin
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

    // Entrance animation - board rises with log curve, stones ripple with sin/cos
    if (entranceAnimActive) {
      const elapsed = (now - entranceStartTime) / 1000;
      if (elapsed < 2) {
        // Board rises: logarithmic easing
        const boardT = Math.min(1, Math.log(1 + elapsed * 3) / Math.log(7));
        boardGroup.position.y = -3 * (1 - boardT);

        // Stones wave: sin/cos ripple from center
        const half = (boardSize - 1) / 2;
        for (const [key, mesh] of stoneMeshes) {
          const [sx, sy] = key.split(',').map(Number);
          const dist = Math.hypot(sx - half, sy - half);
          const wave = Math.sin(elapsed * 6 - dist * 0.5) * Math.cos(elapsed * 4) *
                       Math.max(0, 0.3 * (1 - elapsed / 2));
          mesh.position.y = STONE_HEIGHT + wave;
        }
      } else {
        entranceAnimActive = false;
        boardGroup.position.y = 0;
        for (const [, mesh] of stoneMeshes) {
          mesh.position.y = STONE_HEIGHT;
        }
      }
    }

    // Ghost stone
    renderGhostStone();

    renderer.render(scene, camera);
  }

  let ghostMesh = null;
  function renderGhostStone() {
    if (ghostMesh) {
      stonesGroup.remove(ghostMesh);
      ghostMesh.geometry.dispose();
      ghostMesh = null;
    }
    if (!ghostStone || scoringMode) return;
    const geo = new THREE.SphereGeometry(STONE_RADIUS, 24, 16);
    geo.scale(1, 0.35, 1);
    const mat = ghostStone.color === 1 ? ghostBlackMat : ghostWhiteMat;
    ghostMesh = new THREE.Mesh(geo, mat);
    ghostMesh.position.set(ghostStone.x, STONE_HEIGHT, ghostStone.y);
    stonesGroup.add(ghostMesh);
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

  function setScoringMode(val) {
    scoringMode = val;
  }

  function setDeadStones(ds) {
    deadStones = new Set(ds.map(([x, y]) => `${x},${y}`));
    updateMarkers(lastMovePos);
  }

  function destroy() {
    if (animationId) cancelAnimationFrame(animationId);
    renderer.dispose();
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
