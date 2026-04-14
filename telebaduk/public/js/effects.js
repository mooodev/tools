// Particle Effects System - capture burn, atari rain, win/lose celebrations
const Effects = (() => {
  let scene, stonesGroup;
  let particles = []; // live particles
  let systems = []; // active systems

  function init(sceneRef, stonesRef) {
    scene = sceneRef;
    stonesGroup = stonesRef;
  }

  class Particle {
    constructor(x, y, z, vx, vy, vz, color, size, life, gravity) {
      const geo = new THREE.SphereGeometry(size, 6, 4);
      this.mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 1
      }));
      this.mesh.position.set(x, y, z);
      scene.add(this.mesh);
      this.vx = vx; this.vy = vy; this.vz = vz;
      this.life = life; this.maxLife = life;
      this.gravity = gravity || -4;
      this.alive = true;
    }

    update(dt) {
      if (!this.alive) return;
      this.life -= dt;
      if (this.life <= 0) {
        this.alive = false;
        scene.remove(this.mesh);
        this.mesh.geometry.dispose();
        this.mesh.material.dispose();
        return;
      }
      this.vy += this.gravity * dt;
      this.mesh.position.x += this.vx * dt;
      this.mesh.position.y += this.vy * dt;
      this.mesh.position.z += this.vz * dt;

      const t = this.life / this.maxLife;
      this.mesh.material.opacity = t;
      const s = 0.5 + t * 0.5;
      this.mesh.scale.set(s, s, s);
    }
  }

  // ─── CAPTURE BURN EFFECT ───
  // Explodes stones into fiery particles
  function captureEffect(capturedStones, stoneColor) {
    for (const [x, y] of capturedStones) {
      const count = 12 + Math.floor(Math.random() * 8);
      const baseColor = stoneColor === 1 ? 0x332200 : 0xffddaa;

      for (let i = 0; i < count; i++) {
        // Spread using sin/cos for circular burst
        const angle = (i / count) * Math.PI * 2 + Math.random() * 0.3;
        const speed = 1.5 + Math.random() * 3;
        const upSpeed = 2 + Math.random() * 4;

        const vx = Math.cos(angle) * speed;
        const vz = Math.sin(angle) * speed;
        const vy = upSpeed;

        // Fire colors: orange -> red -> dark
        const colors = [0xff6600, 0xff3300, 0xff8800, 0xffaa00, baseColor];
        const color = colors[Math.floor(Math.random() * colors.length)];
        const size = 0.04 + Math.random() * 0.06;
        const life = 0.4 + Math.random() * 0.6;

        particles.push(new Particle(x, 0.15, y, vx, vy, vz, color, size, life, -6));
      }

      // Ember ring - spiraling embers using sin/cos
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const r = 0.3;
        particles.push(new Particle(
          x + Math.cos(a) * r, 0.3, y + Math.sin(a) * r,
          Math.cos(a + Math.PI / 3) * 0.5,
          3 + Math.random() * 2,
          Math.sin(a + Math.PI / 3) * 0.5,
          0xff4400, 0.03, 0.8 + Math.random() * 0.4, -2
        ));
      }
    }
  }

  // ─── ATARI RAIN ───
  // Gentle rain particles falling over atari groups
  function atariRain(atariGroups) {
    // Stop existing rain systems
    systems = systems.filter(s => s.type !== 'rain');

    for (const group of atariGroups) {
      if (!group.stones || group.stones.length === 0) continue;
      const sys = {
        type: 'rain',
        stones: group.stones,
        interval: 0.15,
        timer: 0,
        duration: 5,
        elapsed: 0
      };
      systems.push(sys);
    }
  }

  function spawnRainDrop(stones) {
    const [x, y] = stones[Math.floor(Math.random() * stones.length)];
    const ox = (Math.random() - 0.5) * 0.6;
    const oz = (Math.random() - 0.5) * 0.6;
    particles.push(new Particle(
      x + ox, 3 + Math.random() * 2, y + oz,
      0, -0.5, 0,
      0x6688cc, 0.025, 1.5, -5
    ));
  }

  // ─── WIN CELEBRATION ───
  // Logarithmic spiral fireworks with sin/cos oscillations
  function winEffect(boardSize) {
    const half = (boardSize - 1) / 2;
    const colors = [0xffcc00, 0xff6600, 0x44ff44, 0x4488ff, 0xff44ff];
    const totalTime = performance.now();

    // Spiral burst
    for (let i = 0; i < 60; i++) {
      // Logarithmic spiral: r = a * e^(b*theta)
      const theta = (i / 60) * Math.PI * 6;
      const r = 0.3 * Math.exp(0.12 * theta);
      const speed = 2 + Math.log(1 + i) * 1.5;

      const vx = Math.cos(theta) * speed;
      const vz = Math.sin(theta) * speed;
      const vy = 4 + Math.sin(i * 0.5) * 2;

      const color = colors[i % colors.length];
      const size = 0.05 + Math.random() * 0.04;
      const life = 1 + Math.random() * 1.5;

      particles.push(new Particle(half, 0.5, half, vx, vy, vz, color, size, life, -3));
    }

    // Secondary burst with delay effect using sin modulation
    for (let i = 0; i < 30; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 3 + Math.random() * 3;
      const vx = Math.cos(angle) * speed * Math.sin(i * 0.3);
      const vz = Math.sin(angle) * speed * Math.cos(i * 0.3);
      particles.push(new Particle(
        half, 1, half,
        vx, 5 + Math.random() * 3, vz,
        0xffffff, 0.03, 1.2, -4
      ));
    }
  }

  // ─── LOSE EFFECT ───
  // Slow falling dark particles, dampened sine wave
  function loseEffect(boardSize) {
    const half = (boardSize - 1) / 2;

    for (let i = 0; i < 40; i++) {
      const x = half + (Math.random() - 0.5) * boardSize * 0.8;
      const z = half + (Math.random() - 0.5) * boardSize * 0.8;
      // Dampened sine: particles drift slowly downward
      const vy = -0.5 - Math.random() * 0.5;
      const vx = Math.sin(i * 0.7) * 0.3;
      const vz = Math.cos(i * 0.7) * 0.3;

      particles.push(new Particle(
        x, 4 + Math.random() * 3, z,
        vx, vy, vz,
        0x333344, 0.04, 2 + Math.random(), 0.5
      ));
    }
  }

  // ─── GAME START RIPPLE ───
  // Concentric rings expanding from center with sin wave
  function startRipple(boardSize) {
    const half = (boardSize - 1) / 2;

    for (let ring = 0; ring < 4; ring++) {
      const count = 16 + ring * 8;
      const delay = ring * 0.15;

      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2;
        const baseSpeed = 2 + ring * 1.5;
        // Sin modulated speed for organic feel
        const speed = baseSpeed + Math.sin(angle * 3) * 0.5;

        particles.push(new Particle(
          half, 0.1 + ring * 0.1, half,
          Math.cos(angle) * speed,
          1 + Math.sin(i * 0.5) * 0.5,
          Math.sin(angle) * speed,
          0xc8956c, 0.03, 0.6 + ring * 0.2, -2
        ));
      }
    }
  }

  // ─── STONE PLACE RIPPLE ───
  function placeRipple(x, y, color) {
    const baseColor = color === 1 ? 0x444444 : 0xdddddd;
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      particles.push(new Particle(
        x, 0.15, y,
        Math.cos(angle) * 1.5, 0.5, Math.sin(angle) * 1.5,
        baseColor, 0.025, 0.4, -2
      ));
    }
  }

  // ─── UPDATE LOOP ───
  function update(dt) {
    // Update systems
    for (let i = systems.length - 1; i >= 0; i--) {
      const sys = systems[i];
      sys.elapsed += dt;
      if (sys.elapsed >= sys.duration) {
        systems.splice(i, 1);
        continue;
      }

      if (sys.type === 'rain') {
        sys.timer += dt;
        if (sys.timer >= sys.interval) {
          sys.timer = 0;
          spawnRainDrop(sys.stones);
        }
      }
    }

    // Update particles
    for (let i = particles.length - 1; i >= 0; i--) {
      particles[i].update(dt);
      if (!particles[i].alive) particles.splice(i, 1);
    }
  }

  function clearAll() {
    for (const p of particles) {
      if (p.mesh.parent) scene.remove(p.mesh);
      p.mesh.geometry.dispose();
      p.mesh.material.dispose();
    }
    particles = [];
    systems = [];
  }

  return {
    init, update, captureEffect, atariRain, winEffect, loseEffect,
    startRipple, placeRipple, clearAll
  };
})();
