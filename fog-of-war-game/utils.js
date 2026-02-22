// ============================================================
// UTILS.JS - Helper functions, math, priority queue
// ============================================================

function clamp(v, min, max) { return v < min ? min : v > max ? max : v; }
function dist(x1, y1, x2, y2) { return Math.sqrt((x2-x1)**2 + (y2-y1)**2); }
function tileDist(a, b) { return Math.max(Math.abs(a.tx - b.tx), Math.abs(a.ty - b.ty)); }
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function randFloat(min, max) { return Math.random() * (max - min) + min; }
function lerp(a, b, t) { return a + (b - a) * t; }

// Simple seeded noise for map gen
function simpleNoise(x, y, seed) {
  let n = Math.sin(x * 12.9898 + y * 78.233 + seed * 43.314) * 43758.5453;
  return n - Math.floor(n);
}

function smoothNoise(x, y, seed, scale) {
  const sx = x / scale, sy = y / scale;
  const ix = Math.floor(sx), iy = Math.floor(sy);
  const fx = sx - ix, fy = sy - iy;
  const a = simpleNoise(ix, iy, seed);
  const b = simpleNoise(ix + 1, iy, seed);
  const c = simpleNoise(ix, iy + 1, seed);
  const d = simpleNoise(ix + 1, iy + 1, seed);
  const ab = lerp(a, b, fx), cd = lerp(c, d, fx);
  return lerp(ab, cd, fy);
}

function fbmNoise(x, y, seed, octaves, scale) {
  let val = 0, amp = 1, freq = 1, max = 0;
  for (let i = 0; i < octaves; i++) {
    val += smoothNoise(x * freq, y * freq, seed + i * 100, scale) * amp;
    max += amp; amp *= 0.5; freq *= 2;
  }
  return val / max;
}

// Priority Queue (min-heap) for A*
class PriorityQueue {
  constructor() { this.data = []; }
  get size() { return this.data.length; }
  push(item, priority) {
    this.data.push({ item, priority });
    this._bubbleUp(this.data.length - 1);
  }
  pop() {
    const top = this.data[0];
    const last = this.data.pop();
    if (this.data.length > 0) { this.data[0] = last; this._sinkDown(0); }
    return top ? top.item : null;
  }
  _bubbleUp(i) {
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.data[p].priority <= this.data[i].priority) break;
      [this.data[p], this.data[i]] = [this.data[i], this.data[p]];
      i = p;
    }
  }
  _sinkDown(i) {
    const n = this.data.length;
    while (true) {
      let smallest = i, l = 2 * i + 1, r = 2 * i + 2;
      if (l < n && this.data[l].priority < this.data[smallest].priority) smallest = l;
      if (r < n && this.data[r].priority < this.data[smallest].priority) smallest = r;
      if (smallest === i) break;
      [this.data[smallest], this.data[i]] = [this.data[i], this.data[smallest]];
      i = smallest;
    }
  }
}

// Generate unique entity IDs
let _entityId = 0;
function nextId() { return ++_entityId; }

// Timer helper
class GameTimer {
  constructor(duration, callback) {
    this.duration = duration;
    this.elapsed = 0;
    this.callback = callback;
    this.done = false;
  }
  update(dt) {
    if (this.done) return;
    this.elapsed += dt;
    if (this.elapsed >= this.duration) { this.done = true; if (this.callback) this.callback(); }
  }
  get progress() { return clamp(this.elapsed / this.duration, 0, 1); }
}

// Notification system
const notifications = [];
function notify(text, duration = 3000) {
  notifications.push({ text, time: Date.now(), duration });
}
