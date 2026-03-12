// ============================================================
// Particles - Simple particle systems (rain, snow, fog)
// ============================================================

import state from './state.js';
import { scene } from './renderer.js';

let particleGroup = null;
let particleData = [];
let particleGeo = null;
let particleMat = null;

const PARTICLE_COUNT = {
  rain: 3000,
  snow: 1500,
  fog: 800,
};

const PARTICLE_AREA = 30;
const PARTICLE_HEIGHT = 20;

function clearParticles() {
  if (particleGroup) {
    particleGroup.traverse(child => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
    });
    scene.remove(particleGroup);
    particleGroup = null;
    particleData = [];
    particleGeo = null;
    particleMat = null;
  }
  state.particleType = 'none';
}

function createRainParticles() {
  const count = PARTICLE_COUNT.rain;
  particleGeo = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  particleData = [];

  const cx = state.gridSize / 2;
  const cz = state.gridSize / 2;

  for (let i = 0; i < count; i++) {
    const x = cx + (Math.random() - 0.5) * PARTICLE_AREA;
    const y = Math.random() * PARTICLE_HEIGHT;
    const z = cz + (Math.random() - 0.5) * PARTICLE_AREA;
    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;
    particleData.push({ speed: 8 + Math.random() * 6 });
  }

  particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  particleMat = new THREE.PointsMaterial({
    color: 0x99ccff,
    size: 0.05,
    transparent: true,
    opacity: 0.6,
    depthWrite: false,
  });

  particleGroup = new THREE.Points(particleGeo, particleMat);
  scene.add(particleGroup);
}

function createSnowParticles() {
  const count = PARTICLE_COUNT.snow;
  particleGeo = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  particleData = [];

  const cx = state.gridSize / 2;
  const cz = state.gridSize / 2;

  for (let i = 0; i < count; i++) {
    const x = cx + (Math.random() - 0.5) * PARTICLE_AREA;
    const y = Math.random() * PARTICLE_HEIGHT;
    const z = cz + (Math.random() - 0.5) * PARTICLE_AREA;
    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;
    particleData.push({
      speed: 0.5 + Math.random() * 1.5,
      driftX: (Math.random() - 0.5) * 0.5,
      driftZ: (Math.random() - 0.5) * 0.5,
      wobble: Math.random() * Math.PI * 2,
    });
  }

  particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  particleMat = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 0.12,
    transparent: true,
    opacity: 0.8,
    depthWrite: false,
  });

  particleGroup = new THREE.Points(particleGeo, particleMat);
  scene.add(particleGroup);
}

function createFogParticles() {
  const count = PARTICLE_COUNT.fog;
  particleGeo = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  particleData = [];

  const cx = state.gridSize / 2;
  const cz = state.gridSize / 2;

  for (let i = 0; i < count; i++) {
    const x = cx + (Math.random() - 0.5) * PARTICLE_AREA;
    const y = 0.2 + Math.random() * 3;
    const z = cz + (Math.random() - 0.5) * PARTICLE_AREA;
    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;
    particleData.push({
      driftX: (Math.random() - 0.5) * 0.3,
      driftZ: (Math.random() - 0.5) * 0.1,
      baseY: y,
      wobble: Math.random() * Math.PI * 2,
    });
  }

  particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  particleMat = new THREE.PointsMaterial({
    color: 0xcccccc,
    size: 0.5,
    transparent: true,
    opacity: 0.25,
    depthWrite: false,
  });

  particleGroup = new THREE.Points(particleGeo, particleMat);
  scene.add(particleGroup);
}

function setParticleType(type) {
  clearParticles();
  state.particleType = type;

  switch (type) {
    case 'rain': createRainParticles(); break;
    case 'snow': createSnowParticles(); break;
    case 'fog':  createFogParticles(); break;
  }
}

function updateParticles(dt) {
  if (!particleGroup || !particleGeo) return;

  const positions = particleGeo.attributes.position.array;
  const count = particleData.length;
  const cx = state.gridSize / 2;
  const cz = state.gridSize / 2;
  const halfArea = PARTICLE_AREA / 2;

  for (let i = 0; i < count; i++) {
    const idx = i * 3;

    if (state.particleType === 'rain') {
      positions[idx + 1] -= particleData[i].speed * dt;
      if (positions[idx + 1] < 0) {
        positions[idx + 1] = PARTICLE_HEIGHT;
        positions[idx] = cx + (Math.random() - 0.5) * PARTICLE_AREA;
        positions[idx + 2] = cz + (Math.random() - 0.5) * PARTICLE_AREA;
      }
    } else if (state.particleType === 'snow') {
      const pd = particleData[i];
      pd.wobble += dt * 2;
      positions[idx + 1] -= pd.speed * dt;
      positions[idx] += Math.sin(pd.wobble) * pd.driftX * dt;
      positions[idx + 2] += Math.cos(pd.wobble) * pd.driftZ * dt;
      if (positions[idx + 1] < 0) {
        positions[idx + 1] = PARTICLE_HEIGHT;
        positions[idx] = cx + (Math.random() - 0.5) * PARTICLE_AREA;
        positions[idx + 2] = cz + (Math.random() - 0.5) * PARTICLE_AREA;
      }
    } else if (state.particleType === 'fog') {
      const pd = particleData[i];
      pd.wobble += dt * 0.5;
      positions[idx] += pd.driftX * dt;
      positions[idx + 2] += pd.driftZ * dt;
      positions[idx + 1] = pd.baseY + Math.sin(pd.wobble) * 0.3;

      // Wrap around
      if (positions[idx] < cx - halfArea) positions[idx] += PARTICLE_AREA;
      if (positions[idx] > cx + halfArea) positions[idx] -= PARTICLE_AREA;
      if (positions[idx + 2] < cz - halfArea) positions[idx + 2] += PARTICLE_AREA;
      if (positions[idx + 2] > cz + halfArea) positions[idx + 2] -= PARTICLE_AREA;
    }
  }

  particleGeo.attributes.position.needsUpdate = true;
}

function initParticleControls() {
  const select = document.getElementById('particle-select');
  if (select) {
    select.addEventListener('change', e => {
      setParticleType(e.target.value);
    });
  }
}

export { setParticleType, updateParticles, clearParticles, initParticleControls };
