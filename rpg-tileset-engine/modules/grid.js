// ============================================================
// Grid - Grid helper creation and management
// ============================================================

import state from './state.js';
import { TILE_WORLD_SIZE, GRID_COLOR } from './constants.js';
import { scene } from './renderer.js';

let gridHelper = null;

function createGrid() {
  const group = new THREE.Group();
  const material = new THREE.LineBasicMaterial({ color: GRID_COLOR, transparent: true, opacity: 0.3 });

  for (let i = 0; i <= state.gridSize; i++) {
    const points1 = [new THREE.Vector3(i, 0.005, 0), new THREE.Vector3(i, 0.005, state.gridSize)];
    const points2 = [new THREE.Vector3(0, 0.005, i), new THREE.Vector3(state.gridSize, 0.005, i)];
    group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points1), material));
    group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points2), material));
  }
  return group;
}

function initGrid() {
  gridHelper = createGrid();
  scene.add(gridHelper);
  return gridHelper;
}

function rebuildGrid() {
  if (gridHelper) {
    gridHelper.traverse(child => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
    });
    scene.remove(gridHelper);
  }
  gridHelper = createGrid();
  gridHelper.position.y = state.heightLevel * TILE_WORLD_SIZE;
  gridHelper.visible = state.showGrid;
  scene.add(gridHelper);
  return gridHelper;
}

function getGridHelper() {
  return gridHelper;
}

export { createGrid, initGrid, rebuildGrid, getGridHelper };
