// ============================================================
// Renderer - Three.js scene, renderer, camera, default lights
// ============================================================

import state from './state.js';
import { TILE_WORLD_SIZE } from './constants.js';

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
camera.lookAt(state.gridSize / 4, 0, state.gridSize / 4);

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
let ground;
function createGround() {
  if (ground) {
    ground.geometry.dispose();
    ground.material.dispose();
    scene.remove(ground);
  }
  const groundGeo = new THREE.PlaneGeometry(state.gridSize, state.gridSize);
  const groundMat = new THREE.MeshStandardMaterial({
    color: 0x222244,
    roughness: 0.9,
    metalness: 0.0,
  });
  ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(state.gridSize / 2, -0.01, state.gridSize / 2);
  ground.receiveShadow = true;
  scene.add(ground);
}
createGround();

// Resize handler
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

export { canvas, renderer, scene, camera, ambientLight, dirLight, resize, createGround };
