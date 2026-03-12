// ============================================================
// Shapes - 3D shape creation (flat tile, block, prism, wall, sideplane)
// ============================================================

import state from './state.js';
import { TILE_WORLD_SIZE, LAYER_OFFSET } from './constants.js';
import { scene } from './renderer.js';
import { getTileUV, makeTileMaterial, setPlaneUV } from './uv.js';

function getLayerFromKey(key) {
  const match = key.match(/,L(\d+)$/);
  return match ? parseInt(match[1]) : 0;
}

function parseKeyCoords(key) {
  const parts = key.split(',');
  return {
    x: parseInt(parts[0]),
    z: parseInt(parts[1]),
    y: parseInt(parts[2]),
    face: parts[3] ? parts[3].split('_')[0] : 'top',
    layer: getLayerFromKey(key),
  };
}

// -- Flat Tile --
function createFlatTileMesh(key, tileData) {
  const { x, z, y, face, layer } = parseKeyCoords(key);
  const layerOff = layer * LAYER_OFFSET;

  const { col, row } = tileData;
  const uv = getTileUV(col, row);

  const geometry = new THREE.PlaneGeometry(TILE_WORLD_SIZE, TILE_WORLD_SIZE);
  const material = makeTileMaterial();
  const mesh = new THREE.Mesh(geometry, material);

  if (face === 'top') {
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x + 0.5, y * TILE_WORLD_SIZE + 0.005 + layerOff, z + 0.5);
  } else if (face === 'front') {
    mesh.position.set(x + 0.5, y * TILE_WORLD_SIZE + 0.5, z + layerOff);
  } else if (face === 'left') {
    mesh.rotation.y = Math.PI / 2;
    mesh.position.set(x + layerOff, y * TILE_WORLD_SIZE + 0.5, z + 0.5);
  }

  setPlaneUV(geometry, uv);
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  scene.add(mesh);
  return mesh;
}

// -- Block (Box) --
function createBlockMesh(key, tileData) {
  const { x, z, y, layer } = parseKeyCoords(key);

  const { col, row } = tileData;
  const bw = tileData.blockW || 1;
  const bh = tileData.blockH || 1;
  const bd = tileData.blockD || 1;
  const uv = getTileUV(col, row);

  const group = new THREE.Group();

  const faces = [
    { w: bw, h: bd, pos: [bw / 2, bh, bd / 2], rot: [-Math.PI / 2, 0, 0] },
    { w: bw, h: bd, pos: [bw / 2, 0, bd / 2], rot: [Math.PI / 2, 0, 0] },
    { w: bw, h: bh, pos: [bw / 2, bh / 2, bd], rot: [0, 0, 0] },
    { w: bw, h: bh, pos: [bw / 2, bh / 2, 0], rot: [0, Math.PI, 0] },
    { w: bd, h: bh, pos: [bw, bh / 2, bd / 2], rot: [0, Math.PI / 2, 0] },
    { w: bd, h: bh, pos: [0, bh / 2, bd / 2], rot: [0, -Math.PI / 2, 0] },
  ];

  faces.forEach(f => {
    const tilesX = Math.ceil(f.w);
    const tilesY = Math.ceil(f.h);

    for (let tx = 0; tx < tilesX; tx++) {
      for (let ty = 0; ty < tilesY; ty++) {
        const pw = Math.min(1, f.w - tx);
        const ph = Math.min(1, f.h - ty);

        const geo = new THREE.PlaneGeometry(pw, ph);
        const mat = makeTileMaterial();
        const plane = new THREE.Mesh(geo, mat);

        const partialUV = {
          u0: uv.u0,
          u1: uv.u0 + (uv.u1 - uv.u0) * pw,
          v0: uv.v0 + (uv.v1 - uv.v0) * (1 - ph),
          v1: uv.v1,
        };
        setPlaneUV(geo, partialUV);

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

  const layerOff = layer * LAYER_OFFSET;
  group.position.set(x, y * TILE_WORLD_SIZE + layerOff, z);
  scene.add(group);
  return group;
}

// -- Right-Angle Triangular Prism (90-degree wedge/ramp) --
// Cross-section: right triangle with 90deg at bottom-back corner
// Vertices: (0,0), (w,0), (0,h) - right angle at origin
// This creates a ramp shape: flat bottom, vertical back wall, sloped hypotenuse
function createPrismMesh(key, tileData) {
  const { x, z, y, layer } = parseKeyCoords(key);

  const { col, row } = tileData;
  const rot = (tileData.rotation || 0) * Math.PI / 180;
  const uv = getTileUV(col, row);

  const group = new THREE.Group();

  const w = TILE_WORLD_SIZE;
  const h = TILE_WORLD_SIZE;
  const d = TILE_WORLD_SIZE;

  // Right-angle triangle cross-section:
  // (0,0) bottom-left [right angle], (w,0) bottom-right, (0,h) top-left
  // Bottom edge: (0,0)-(w,0), Back edge: (0,0)-(0,h), Hypotenuse: (w,0)-(0,h)

  // --- Two triangular end caps ---
  for (let side = 0; side < 2; side++) {
    const triShape = new THREE.Shape();
    triShape.moveTo(0, 0);
    triShape.lineTo(w, 0);
    triShape.lineTo(0, h);
    triShape.lineTo(0, 0);

    const triGeo = new THREE.ShapeGeometry(triShape);
    const triMat = makeTileMaterial();

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
      // Front cap at z=0
      triMesh.position.z = 0;
    } else {
      // Back cap at z=d, flipped
      triMesh.position.z = d;
      triMesh.rotation.y = Math.PI;
      triMesh.position.x = w;
    }
    group.add(triMesh);
  }

  // --- Bottom face (flat rectangle on ground) ---
  const bottomGeo = new THREE.PlaneGeometry(w, d);
  const bottomMat = makeTileMaterial();
  const bottomMesh = new THREE.Mesh(bottomGeo, bottomMat);
  setPlaneUV(bottomGeo, uv);
  bottomMesh.rotation.x = Math.PI / 2;
  bottomMesh.position.set(w / 2, 0, d / 2);
  bottomMesh.receiveShadow = true;
  group.add(bottomMesh);

  // --- Back face (vertical wall at x=0) ---
  const backGeo = new THREE.PlaneGeometry(d, h);
  const backMat = makeTileMaterial();
  const backMesh = new THREE.Mesh(backGeo, backMat);
  setPlaneUV(backGeo, uv);
  backMesh.rotation.y = Math.PI / 2;
  backMesh.position.set(0, h / 2, d / 2);
  backMesh.castShadow = true;
  backMesh.receiveShadow = true;
  group.add(backMesh);

  // --- Slope face (hypotenuse from (w,0) to (0,h)) ---
  const slopeLen = Math.sqrt(w * w + h * h);
  const slopeGeo = new THREE.PlaneGeometry(slopeLen, d);
  const slopeMat = makeTileMaterial();
  const slopeMesh = new THREE.Mesh(slopeGeo, slopeMat);
  setPlaneUV(slopeGeo, uv);
  slopeMesh.castShadow = true;
  slopeMesh.receiveShadow = true;

  // Angle of hypotenuse: atan2(h, w) from bottom-right going up-left
  const slopeAngle = Math.atan2(h, w);
  // Position at midpoint of hypotenuse
  slopeMesh.position.set(w / 2, h / 2, d / 2);
  // Rotate to match the slope: tilt around Z axis
  slopeMesh.rotation.z = Math.PI / 2 + slopeAngle;
  group.add(slopeMesh);

  // Apply rotation around center
  const layerOff = layer * LAYER_OFFSET;
  group.position.set(x, y * TILE_WORLD_SIZE + layerOff, z);

  if (rot !== 0) {
    const pivot = new THREE.Group();
    pivot.position.set(x + w / 2, y * TILE_WORLD_SIZE + layerOff, z + d / 2);
    group.position.set(-w / 2, 0, -d / 2);
    pivot.rotation.y = rot;
    pivot.add(group);
    scene.add(pivot);
    return pivot;
  }

  scene.add(group);
  return group;
}

// -- Wall (vertical plane) --
function createWallMesh(key, tileData) {
  const { x, z, y, layer } = parseKeyCoords(key);

  const { col, row } = tileData;
  const rot = (tileData.rotation || 0) * Math.PI / 180;
  const uv = getTileUV(col, row);

  const geometry = new THREE.PlaneGeometry(TILE_WORLD_SIZE, TILE_WORLD_SIZE);
  const material = makeTileMaterial();
  const mesh = new THREE.Mesh(geometry, material);

  setPlaneUV(geometry, uv);

  const layerOff = layer * LAYER_OFFSET;

  mesh.position.set(x + 0.5, y * TILE_WORLD_SIZE + 0.5 + layerOff, z + 0.5);
  mesh.rotation.y = rot;

  mesh.castShadow = true;
  mesh.receiveShadow = true;

  scene.add(mesh);
  return mesh;
}

// -- Side Plane --
function createSidePlaneMesh(key, tileData) {
  const { x, z, y, layer } = parseKeyCoords(key);

  const { col, row } = tileData;
  const rot = (tileData.rotation || 0) * Math.PI / 180;
  const uv = getTileUV(col, row);

  const geometry = new THREE.PlaneGeometry(TILE_WORLD_SIZE, TILE_WORLD_SIZE);
  const material = makeTileMaterial();
  const mesh = new THREE.Mesh(geometry, material);

  setPlaneUV(geometry, uv);

  const layerOff = layer * LAYER_OFFSET;

  mesh.rotation.y = Math.PI / 2 + rot;
  mesh.position.set(x + 0.5, y * TILE_WORLD_SIZE + 0.5 + layerOff, z + 0.5);

  mesh.castShadow = true;
  mesh.receiveShadow = true;

  scene.add(mesh);
  return mesh;
}

export {
  getLayerFromKey,
  parseKeyCoords,
  createFlatTileMesh,
  createBlockMesh,
  createPrismMesh,
  createWallMesh,
  createSidePlaneMesh,
};
