// ============================================================
// Input - Viewport mouse interaction and raycasting
// ============================================================

import state from './state.js';
import { TILE_WORLD_SIZE, GRID_COLOR_HIGHLIGHT } from './constants.js';
import { canvas, scene, camera } from './renderer.js';
import { camState } from './camera.js';
import { placeTile, eraseTile, fillRect, placeMultiTile } from './tiles.js';
import { pushUndo } from './undo.js';

// Raycaster planes for each face type
const raycasterPlanes = {};
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

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

function updateRaycastPlanes() {
  Object.values(raycasterPlanes).forEach(p => scene.remove(p));

  const h = state.heightLevel;

  // Top face plane (horizontal at height h)
  const topGeo = new THREE.PlaneGeometry(state.gridSize * 2, state.gridSize * 2);
  const topMat = new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide });
  const topPlane = new THREE.Mesh(topGeo, topMat);
  topPlane.rotation.x = -Math.PI / 2;
  topPlane.position.y = h * TILE_WORLD_SIZE;
  scene.add(topPlane);
  raycasterPlanes.top = topPlane;

  // Front face plane - now uses the top plane for position picking
  // Allow placement anywhere on the map, not just at z=0
  const frontGeo = new THREE.PlaneGeometry(state.gridSize * 2, state.gridSize * 2);
  const frontMat = new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide });
  const frontPlane = new THREE.Mesh(frontGeo, frontMat);
  frontPlane.rotation.x = -Math.PI / 2;
  frontPlane.position.y = h * TILE_WORLD_SIZE;
  scene.add(frontPlane);
  raycasterPlanes.front = frontPlane;

  // Left face plane - also uses ground plane for position picking
  const leftGeo = new THREE.PlaneGeometry(state.gridSize * 2, state.gridSize * 2);
  const leftMat = new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide });
  const leftPlane = new THREE.Mesh(leftGeo, leftMat);
  leftPlane.rotation.x = -Math.PI / 2;
  leftPlane.position.y = h * TILE_WORLD_SIZE;
  scene.add(leftPlane);
  raycasterPlanes.left = leftPlane;
}

function getGridPos(e) {
  const rect = canvas.getBoundingClientRect();
  mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);

  const plane = raycasterPlanes[state.face];
  if (!plane) return null;

  const intersects = raycaster.intersectObject(plane);
  if (intersects.length === 0) return null;

  const point = intersects[0].point;

  // All faces now use the same ground-plane intersection for X,Z picking
  const gx = Math.floor(point.x);
  const gz = Math.floor(point.z);

  if (gx < 0 || gx >= state.gridSize || gz < 0 || gz >= state.gridSize) return null;

  return { x: gx, z: gz };
}

let isDrawing = false;
let currentStrokeUndo = [];

function initViewportInput() {
  updateRaycastPlanes();

  canvas.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    if (camState.isDragging || camState.isPanning) return;

    const pos = getGridPos(e);
    if (!pos) return;

    if (state.tool === 'rect') {
      state.rectStart = pos;
    } else if (state.tool === 'draw') {
      isDrawing = true;
      currentStrokeUndo = [];
      placeMultiTile(pos.x, pos.z, currentStrokeUndo);
    } else if (state.tool === 'erase') {
      isDrawing = true;
      currentStrokeUndo = [];
      eraseTile(pos.x, pos.z, currentStrokeUndo);
    }
  });

  canvas.addEventListener('mousemove', e => {
    const pos = getGridPos(e);
    if (pos) {
      state.hoverPos = pos;
      document.getElementById('info-pos').textContent = `Position: (${pos.x}, ${pos.z}) H:${state.heightLevel} L:${state.layer}`;

      hoverMesh.visible = true;
      if (state.face === 'top') {
        hoverMesh.rotation.set(-Math.PI / 2, 0, 0);
        hoverMesh.position.set(pos.x + 0.5, state.heightLevel * TILE_WORLD_SIZE + 0.01, pos.z + 0.5);
      } else if (state.face === 'front') {
        hoverMesh.rotation.set(0, 0, 0);
        hoverMesh.position.set(pos.x + 0.5, state.heightLevel * TILE_WORLD_SIZE + 0.5, pos.z + 0.5);
      } else if (state.face === 'left') {
        hoverMesh.rotation.set(0, Math.PI / 2, 0);
        hoverMesh.position.set(pos.x + 0.5, state.heightLevel * TILE_WORLD_SIZE + 0.5, pos.z + 0.5);
      }

      if (isDrawing) {
        if (state.tool === 'draw') placeMultiTile(pos.x, pos.z, currentStrokeUndo);
        else if (state.tool === 'erase') eraseTile(pos.x, pos.z, currentStrokeUndo);
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

    if (isDrawing && currentStrokeUndo.length > 0) {
      pushUndo({ action: state.tool, entries: currentStrokeUndo });
      currentStrokeUndo = [];
    }

    isDrawing = false;
  });

  canvas.addEventListener('mouseleave', () => {
    hoverMesh.visible = false;
    isDrawing = false;
  });
}

export { updateRaycastPlanes, getGridPos, initViewportInput };
