// ============================================================
// Particles - Simple particle systems (rain, snow, fog)
// ============================================================

import state from './state.js';
import { scene } from './renderer.js';

let particleGroup = null;
let particleData = [];
let particleGeo = null;
let particleMat = null;

// Default configs per particle type
const PARTICLE_DEFAULTS = {
  rain: { color: '#99ccff', size: 0.05, opacity: 0.6, count: 3000, speed: 1.0, area: 30, height: 20 },
  snow: { color: '#ffffff', size: 0.12, opacity: 0.8, count: 1500, speed: 1.0, area: 30, height: 20 },
  fog:  { color: '#cccccc', size: 0.50, opacity: 0.25, count: 800, speed: 1.0, area: 30, height: 20 },
};

// Current particle options (modified by UI)
const particleOpts = {
  color: '#99ccff',
  size: 0.05,
  opacity: 0.6,
  count: 3000,
  speed: 1.0,
  area: 30,
  height: 20,
};

function getOpts() { return particleOpts; }

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
  const opts = particleOpts;
  const count = opts.count;
  particleGeo = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  particleData = [];

  const cx = state.gridSize / 2;
  const cz = state.gridSize / 2;

  for (let i = 0; i < count; i++) {
    const x = cx + (Math.random() - 0.5) * opts.area;
    const y = Math.random() * opts.height;
    const z = cz + (Math.random() - 0.5) * opts.area;
    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;
    particleData.push({ speed: (8 + Math.random() * 6) * opts.speed });
  }

  particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  particleMat = new THREE.PointsMaterial({
    color: opts.color,
    size: opts.size,
    transparent: true,
    opacity: opts.opacity,
    depthWrite: false,
  });

  particleGroup = new THREE.Points(particleGeo, particleMat);
  scene.add(particleGroup);
}

function createSnowParticles() {
  const opts = particleOpts;
  const count = opts.count;
  particleGeo = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  particleData = [];

  const cx = state.gridSize / 2;
  const cz = state.gridSize / 2;

  for (let i = 0; i < count; i++) {
    const x = cx + (Math.random() - 0.5) * opts.area;
    const y = Math.random() * opts.height;
    const z = cz + (Math.random() - 0.5) * opts.area;
    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;
    particleData.push({
      speed: (0.5 + Math.random() * 1.5) * opts.speed,
      driftX: (Math.random() - 0.5) * 0.5,
      driftZ: (Math.random() - 0.5) * 0.5,
      wobble: Math.random() * Math.PI * 2,
    });
  }

  particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  particleMat = new THREE.PointsMaterial({
    color: opts.color,
    size: opts.size,
    transparent: true,
    opacity: opts.opacity,
    depthWrite: false,
  });

  particleGroup = new THREE.Points(particleGeo, particleMat);
  scene.add(particleGroup);
}

function createFogParticles() {
  const opts = particleOpts;
  const count = opts.count;
  particleGeo = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  particleData = [];

  const cx = state.gridSize / 2;
  const cz = state.gridSize / 2;

  for (let i = 0; i < count; i++) {
    const x = cx + (Math.random() - 0.5) * opts.area;
    const y = 0.2 + Math.random() * 3;
    const z = cz + (Math.random() - 0.5) * opts.area;
    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;
    particleData.push({
      driftX: (Math.random() - 0.5) * 0.3 * opts.speed,
      driftZ: (Math.random() - 0.5) * 0.1 * opts.speed,
      baseY: y,
      wobble: Math.random() * Math.PI * 2,
    });
  }

  particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  particleMat = new THREE.PointsMaterial({
    color: opts.color,
    size: opts.size,
    transparent: true,
    opacity: opts.opacity,
    depthWrite: false,
  });

  particleGroup = new THREE.Points(particleGeo, particleMat);
  scene.add(particleGroup);
}

function setParticleType(type) {
  clearParticles();
  state.particleType = type;

  // Apply defaults for this type
  if (PARTICLE_DEFAULTS[type]) {
    const defaults = PARTICLE_DEFAULTS[type];
    Object.assign(particleOpts, defaults);
    syncUIFromOpts();
  }

  switch (type) {
    case 'rain': createRainParticles(); break;
    case 'snow': createSnowParticles(); break;
    case 'fog':  createFogParticles(); break;
  }
}

function rebuildCurrentParticles() {
  if (state.particleType === 'none') return;
  const type = state.particleType;
  // Clear without resetting particleType
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
  const opts = particleOpts;
  const halfArea = opts.area / 2;

  for (let i = 0; i < count; i++) {
    const idx = i * 3;

    if (state.particleType === 'rain') {
      positions[idx + 1] -= particleData[i].speed * dt;
      if (positions[idx + 1] < 0) {
        positions[idx + 1] = opts.height;
        positions[idx] = cx + (Math.random() - 0.5) * opts.area;
        positions[idx + 2] = cz + (Math.random() - 0.5) * opts.area;
      }
    } else if (state.particleType === 'snow') {
      const pd = particleData[i];
      pd.wobble += dt * 2;
      positions[idx + 1] -= pd.speed * dt;
      positions[idx] += Math.sin(pd.wobble) * pd.driftX * dt;
      positions[idx + 2] += Math.cos(pd.wobble) * pd.driftZ * dt;
      if (positions[idx + 1] < 0) {
        positions[idx + 1] = opts.height;
        positions[idx] = cx + (Math.random() - 0.5) * opts.area;
        positions[idx + 2] = cz + (Math.random() - 0.5) * opts.area;
      }
    } else if (state.particleType === 'fog') {
      const pd = particleData[i];
      pd.wobble += dt * 0.5;
      positions[idx] += pd.driftX * dt;
      positions[idx + 2] += pd.driftZ * dt;
      positions[idx + 1] = pd.baseY + Math.sin(pd.wobble) * 0.3;

      // Wrap around
      if (positions[idx] < cx - halfArea) positions[idx] += opts.area;
      if (positions[idx] > cx + halfArea) positions[idx] -= opts.area;
      if (positions[idx + 2] < cz - halfArea) positions[idx + 2] += opts.area;
      if (positions[idx + 2] > cz + halfArea) positions[idx + 2] -= opts.area;
    }
  }

  particleGeo.attributes.position.needsUpdate = true;
}

function syncUIFromOpts() {
  const opts = particleOpts;
  const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
  const setText = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };

  setVal('particle-color', opts.color);
  setVal('particle-size', Math.round(opts.size * 100));
  setText('particle-size-val', opts.size.toFixed(2));
  setVal('particle-opacity', Math.round(opts.opacity * 100));
  setText('particle-opacity-val', opts.opacity.toFixed(2));
  setVal('particle-count', opts.count);
  setText('particle-count-val', opts.count);
  setVal('particle-speed', Math.round(opts.speed * 100));
  setText('particle-speed-val', opts.speed.toFixed(1) + 'x');
  setVal('particle-area', opts.area);
  setText('particle-area-val', opts.area);
  setVal('particle-height', opts.height);
  setText('particle-height-val', opts.height);
}

function initParticleControls() {
  const select = document.getElementById('particle-select');
  if (select) {
    select.addEventListener('change', e => {
      setParticleType(e.target.value);
    });
  }

  // FX Options panel toggle
  const particlePanel = document.getElementById('particle-panel');
  const btnOpts = document.getElementById('btn-particle-opts');
  const btnClose = document.getElementById('btn-close-particles');

  if (btnOpts && particlePanel) {
    btnOpts.addEventListener('click', () => {
      particlePanel.classList.toggle('visible');
    });
  }
  if (btnClose && particlePanel) {
    btnClose.addEventListener('click', () => {
      particlePanel.classList.remove('visible');
    });
  }

  // Color
  const colorInput = document.getElementById('particle-color');
  if (colorInput) {
    colorInput.addEventListener('input', e => {
      particleOpts.color = e.target.value;
      if (particleMat) particleMat.color.set(e.target.value);
    });
  }

  // Size
  const sizeInput = document.getElementById('particle-size');
  if (sizeInput) {
    sizeInput.addEventListener('input', e => {
      const val = parseInt(e.target.value) / 100;
      particleOpts.size = val;
      document.getElementById('particle-size-val').textContent = val.toFixed(2);
      if (particleMat) particleMat.size = val;
    });
  }

  // Opacity
  const opacityInput = document.getElementById('particle-opacity');
  if (opacityInput) {
    opacityInput.addEventListener('input', e => {
      const val = parseInt(e.target.value) / 100;
      particleOpts.opacity = val;
      document.getElementById('particle-opacity-val').textContent = val.toFixed(2);
      if (particleMat) particleMat.opacity = val;
    });
  }

  // Count (requires rebuild)
  const countInput = document.getElementById('particle-count');
  if (countInput) {
    countInput.addEventListener('change', e => {
      const val = parseInt(e.target.value);
      particleOpts.count = val;
      document.getElementById('particle-count-val').textContent = val;
      rebuildCurrentParticles();
    });
  }

  // Speed (requires rebuild)
  const speedInput = document.getElementById('particle-speed');
  if (speedInput) {
    speedInput.addEventListener('change', e => {
      const val = parseInt(e.target.value) / 100;
      particleOpts.speed = val;
      document.getElementById('particle-speed-val').textContent = val.toFixed(1) + 'x';
      rebuildCurrentParticles();
    });
  }

  // Area (requires rebuild)
  const areaInput = document.getElementById('particle-area');
  if (areaInput) {
    areaInput.addEventListener('change', e => {
      const val = parseInt(e.target.value);
      particleOpts.area = val;
      document.getElementById('particle-area-val').textContent = val;
      rebuildCurrentParticles();
    });
  }

  // Height (requires rebuild)
  const heightInput = document.getElementById('particle-height');
  if (heightInput) {
    heightInput.addEventListener('change', e => {
      const val = parseInt(e.target.value);
      particleOpts.height = val;
      document.getElementById('particle-height-val').textContent = val;
      rebuildCurrentParticles();
    });
  }
}

export { setParticleType, updateParticles, clearParticles, initParticleControls, getOpts };
