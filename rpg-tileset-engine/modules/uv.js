// ============================================================
// UV - UV mapping helpers and material factory
// ============================================================

import state from './state.js';

function getTileUV(col, row) {
  const cols = state.tilesetCols;
  const rows = state.tilesetRows;
  const u0 = col / cols;
  const u1 = (col + 1) / cols;
  const v0 = row / rows;
  const v1 = (row + 1) / rows;
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
  uvAttr.setXY(0, uv.u0, uv.v1);
  uvAttr.setXY(1, uv.u1, uv.v1);
  uvAttr.setXY(2, uv.u0, uv.v0);
  uvAttr.setXY(3, uv.u1, uv.v0);
  uvAttr.needsUpdate = true;
}

export { getTileUV, makeTileMaterial, setPlaneUV };
