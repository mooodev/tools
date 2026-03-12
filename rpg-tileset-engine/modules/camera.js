// ============================================================
// Camera - Custom orbit camera controls
// ============================================================

import state from './state.js';
import { canvas, camera } from './renderer.js';

const camState = {
  target: new THREE.Vector3(state.gridSize / 4, 0, state.gridSize / 4),
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

function initCameraControls() {
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
}

export { camState, updateCamera, initCameraControls };
