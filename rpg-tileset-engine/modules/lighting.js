// ============================================================
// Lighting - Light management, UI, dragging
// ============================================================

import state from './state.js';
import { scene, canvas, camera, renderer, ambientLight, dirLight } from './renderer.js';

const lightingPanel = document.getElementById('lighting-panel');
const lightsList = document.getElementById('lights-list');

function addLight(type, config) {
  const id = state.nextLightId++;
  const lightData = {
    id,
    type,
    color: (config && config.color) || '#ffffff',
    intensity: (config && config.intensity) || 1.0,
    x: (config && config.x) || state.gridSize / 4,
    y: (config && config.y) || 5,
    z: (config && config.z) || state.gridSize / 4,
    castShadow: (config && config.castShadow !== undefined) ? config.castShadow : true,
    distance: (config && config.distance) || 20,
    angle: (config && config.angle) || 45,
    penumbra: (config && config.penumbra) || 0.3,
    threeLight: null,
    helper: null,
  };

  let light;
  switch (type) {
    case 'point':
      light = new THREE.PointLight(lightData.color, lightData.intensity, lightData.distance);
      break;
    case 'spot':
      light = new THREE.SpotLight(lightData.color, lightData.intensity, lightData.distance, lightData.angle * Math.PI / 180, lightData.penumbra);
      light.target.position.set(lightData.x, 0, lightData.z);
      scene.add(light.target);
      break;
    case 'directional':
      light = new THREE.DirectionalLight(lightData.color, lightData.intensity);
      light.shadow.mapSize.set(1024, 1024);
      light.shadow.camera.left = -20;
      light.shadow.camera.right = 20;
      light.shadow.camera.top = 20;
      light.shadow.camera.bottom = -20;
      break;
  }

  light.position.set(lightData.x, lightData.y, lightData.z);
  light.castShadow = lightData.castShadow;
  if (light.shadow) light.shadow.mapSize.set(1024, 1024);

  scene.add(light);
  lightData.threeLight = light;

  const helperGeo = new THREE.SphereGeometry(0.3, 12, 12);
  const helperMat = new THREE.MeshBasicMaterial({ color: lightData.color });
  const helper = new THREE.Mesh(helperGeo, helperMat);
  helper.position.copy(light.position);
  helper.userData.lightId = id;
  scene.add(helper);
  lightData.helper = helper;

  state.userLights.push(lightData);
  renderLightsList();

  return lightData;
}

function removeLight(id) {
  const idx = state.userLights.findIndex(l => l.id === id);
  if (idx === -1) return;

  const lightData = state.userLights[idx];
  scene.remove(lightData.threeLight);
  if (lightData.threeLight.target) scene.remove(lightData.threeLight.target);
  if (lightData.threeLight.shadow && lightData.threeLight.shadow.map) {
    lightData.threeLight.shadow.map.dispose();
  }
  lightData.threeLight.dispose();

  if (lightData.helper) {
    scene.remove(lightData.helper);
    lightData.helper.geometry.dispose();
    lightData.helper.material.dispose();
  }

  state.userLights.splice(idx, 1);
  renderLightsList();
}

function updateLight(id, prop, value) {
  const lightData = state.userLights.find(l => l.id === id);
  if (!lightData) return;

  lightData[prop] = value;
  const light = lightData.threeLight;

  switch (prop) {
    case 'color':
      light.color.set(value);
      if (lightData.helper) lightData.helper.material.color.set(value);
      break;
    case 'intensity':
      light.intensity = value;
      break;
    case 'x': case 'y': case 'z':
      light.position.set(lightData.x, lightData.y, lightData.z);
      if (lightData.helper) lightData.helper.position.copy(light.position);
      if (light.target) light.target.position.set(lightData.x, 0, lightData.z);
      break;
    case 'distance':
      if (light.distance !== undefined) light.distance = value;
      break;
    case 'angle':
      if (light.angle !== undefined) light.angle = value * Math.PI / 180;
      break;
    case 'penumbra':
      if (light.penumbra !== undefined) light.penumbra = value;
      break;
    case 'castShadow':
      light.castShadow = value;
      break;
  }
}

function renderLightsList() {
  lightsList.innerHTML = '';

  state.userLights.forEach(lightData => {
    const item = document.createElement('div');
    item.className = 'light-item';

    const typeLabel = lightData.type.charAt(0).toUpperCase() + lightData.type.slice(1);

    item.innerHTML = `
      <div class="light-header">
        <span><strong>${typeLabel} #${lightData.id}</strong></span>
        <button class="btn-small danger" data-remove="${lightData.id}">Del</button>
      </div>
      <div class="light-row">
        <label>Color:</label>
        <input type="color" value="${lightData.color}" data-id="${lightData.id}" data-prop="color">
        <label>Int:</label>
        <input type="range" min="0" max="500" value="${Math.round(lightData.intensity * 100)}" data-id="${lightData.id}" data-prop="intensity" style="flex:1;">
        <span class="intensity-val" style="min-width:24px;">${lightData.intensity.toFixed(1)}</span>
      </div>
      <div class="light-row">
        <label style="min-width:14px;">X</label>
        <input type="number" value="${lightData.x}" step="0.5" data-id="${lightData.id}" data-prop="x" style="width:38px;">
        <label style="min-width:14px;">Y</label>
        <input type="number" value="${lightData.y}" step="0.5" data-id="${lightData.id}" data-prop="y" style="width:38px;">
        <label style="min-width:14px;">Z</label>
        <input type="number" value="${lightData.z}" step="0.5" data-id="${lightData.id}" data-prop="z" style="width:38px;">
      </div>
      ${lightData.type === 'point' || lightData.type === 'spot' ? `
      <div class="light-row">
        <label>Dist:</label>
        <input type="range" min="1" max="100" value="${lightData.distance}" data-id="${lightData.id}" data-prop="distance" style="flex:1;">
        <span style="min-width:24px;">${lightData.distance}</span>
      </div>
      ` : ''}
      ${lightData.type === 'spot' ? `
      <div class="light-row">
        <label>Angle:</label>
        <input type="range" min="5" max="90" value="${lightData.angle}" data-id="${lightData.id}" data-prop="angle" style="flex:1;">
        <span style="min-width:24px;">${lightData.angle}\u00B0</span>
      </div>
      <div class="light-row">
        <label>Penumbra:</label>
        <input type="range" min="0" max="100" value="${Math.round(lightData.penumbra * 100)}" data-id="${lightData.id}" data-prop="penumbra" style="flex:1;">
        <span style="min-width:24px;">${lightData.penumbra.toFixed(2)}</span>
      </div>
      ` : ''}
      <div class="light-row">
        <label>Shadow:</label>
        <input type="checkbox" ${lightData.castShadow ? 'checked' : ''} data-id="${lightData.id}" data-prop="castShadow">
      </div>
    `;

    lightsList.appendChild(item);
  });

  // Bind events
  lightsList.querySelectorAll('[data-remove]').forEach(btn => {
    btn.addEventListener('click', () => removeLight(parseInt(btn.dataset.remove)));
  });

  lightsList.querySelectorAll('input[data-id]').forEach(input => {
    const id = parseInt(input.dataset.id);
    const prop = input.dataset.prop;

    const handler = () => {
      let value;
      if (input.type === 'checkbox') {
        value = input.checked;
      } else if (input.type === 'color') {
        value = input.value;
      } else if (prop === 'intensity') {
        value = parseInt(input.value) / 100;
        const span = input.nextElementSibling;
        if (span) span.textContent = value.toFixed(1);
      } else if (prop === 'penumbra') {
        value = parseInt(input.value) / 100;
        const span = input.nextElementSibling;
        if (span) span.textContent = value.toFixed(2);
      } else if (prop === 'distance' || prop === 'angle') {
        value = parseInt(input.value);
        const span = input.nextElementSibling;
        if (span) span.textContent = prop === 'angle' ? value + '\u00B0' : value;
      } else {
        value = parseFloat(input.value);
      }
      updateLight(id, prop, value);
    };

    input.addEventListener('input', handler);
    input.addEventListener('change', handler);
  });
}

// Light dragging
const lightDragState = {
  active: false,
  lightData: null,
  dragPlane: new THREE.Plane(),
  offset: new THREE.Vector3(),
  intersection: new THREE.Vector3(),
};

function getLightHelpers() {
  return state.userLights.map(l => l.helper).filter(Boolean);
}

function initLightingControls() {
  document.getElementById('btn-lighting').addEventListener('click', () => {
    lightingPanel.classList.toggle('visible');
  });

  document.getElementById('btn-close-lighting').addEventListener('click', () => {
    lightingPanel.classList.remove('visible');
  });

  document.getElementById('ambient-color').addEventListener('input', e => {
    ambientLight.color.set(e.target.value);
  });

  document.getElementById('ambient-intensity').addEventListener('input', e => {
    const val = parseInt(e.target.value) / 100;
    ambientLight.intensity = val;
    document.getElementById('ambient-val').textContent = val.toFixed(1);
  });

  document.getElementById('toggle-shadows').addEventListener('change', e => {
    renderer.shadowMap.enabled = e.target.checked;
    scene.traverse(child => {
      if (child.material) child.material.needsUpdate = true;
    });
  });

  document.getElementById('dir-color').addEventListener('input', e => {
    dirLight.color.set(e.target.value);
  });

  document.getElementById('dir-intensity').addEventListener('input', e => {
    const val = parseInt(e.target.value) / 100;
    dirLight.intensity = val;
    document.getElementById('dir-intensity-val').textContent = val.toFixed(1);
  });

  ['dir-x', 'dir-y', 'dir-z'].forEach(id => {
    document.getElementById(id).addEventListener('change', () => {
      dirLight.position.set(
        parseFloat(document.getElementById('dir-x').value),
        parseFloat(document.getElementById('dir-y').value),
        parseFloat(document.getElementById('dir-z').value)
      );
    });
  });

  document.getElementById('btn-add-point').addEventListener('click', () => addLight('point'));
  document.getElementById('btn-add-spot').addEventListener('click', () => addLight('spot'));
  document.getElementById('btn-add-dir').addEventListener('click', () => addLight('directional'));

  // Light dragging
  canvas.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    const rect = canvas.getBoundingClientRect();
    const mx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const my = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    const rc = new THREE.Raycaster();
    rc.setFromCamera(new THREE.Vector2(mx, my), camera);

    const helpers = getLightHelpers();
    if (helpers.length === 0) return;

    const hits = rc.intersectObjects(helpers);
    if (hits.length > 0) {
      e.stopPropagation();
      e.preventDefault();

      const hitHelper = hits[0].object;
      const lightId = hitHelper.userData.lightId;
      const ld = state.userLights.find(l => l.id === lightId);
      if (!ld) return;

      lightDragState.active = true;
      lightDragState.lightData = ld;

      const camDir = new THREE.Vector3();
      camera.getWorldDirection(camDir);
      lightDragState.dragPlane.setFromNormalAndCoplanarPoint(camDir, hitHelper.position);

      rc.ray.intersectPlane(lightDragState.dragPlane, lightDragState.intersection);
      lightDragState.offset.copy(hitHelper.position).sub(lightDragState.intersection);

      canvas.style.cursor = 'grabbing';
    }
  }, true);

  window.addEventListener('mousemove', e => {
    if (!lightDragState.active) return;

    const rect = canvas.getBoundingClientRect();
    const mx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const my = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    const rc = new THREE.Raycaster();
    rc.setFromCamera(new THREE.Vector2(mx, my), camera);

    const target = new THREE.Vector3();
    if (rc.ray.intersectPlane(lightDragState.dragPlane, target)) {
      target.add(lightDragState.offset);

      const ld = lightDragState.lightData;
      ld.x = Math.round(target.x * 2) / 2;
      ld.y = Math.round(target.y * 2) / 2;
      ld.z = Math.round(target.z * 2) / 2;

      ld.threeLight.position.set(ld.x, ld.y, ld.z);
      ld.helper.position.set(ld.x, ld.y, ld.z);
      if (ld.threeLight.target) {
        ld.threeLight.target.position.set(ld.x, 0, ld.z);
      }
      renderLightsList();
    }
  });

  window.addEventListener('mouseup', () => {
    if (lightDragState.active) {
      lightDragState.active = false;
      lightDragState.lightData = null;
      canvas.style.cursor = '';
    }
  });
}

export { addLight, removeLight, updateLight, renderLightsList, initLightingControls };
