// Sounds — Web Audio API for stone placement, captures, game events
const Sounds = (() => {
  let ctx = null;
  let enabled = true;
  let initialized = false;

  function ensureContext() {
    if (ctx) return;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      initialized = true;
    } catch (e) {
      // Audio not available
    }
  }

  function playTone(freq, duration, type = 'sine', volume = 0.3, attack = 0.005, decay = 0.1) {
    if (!enabled || !ctx) return;
    if (ctx.state === 'suspended') ctx.resume();

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = type;
    osc.frequency.value = freq;

    const now = ctx.currentTime;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(volume, now + attack);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.start(now);
    osc.stop(now + duration);
  }

  function playNoise(duration, volume = 0.15) {
    if (!enabled || !ctx) return;
    if (ctx.state === 'suspended') ctx.resume();

    const bufferSize = ctx.sampleRate * duration;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 3);
    }

    const source = ctx.createBufferSource();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    source.buffer = buffer;
    filter.type = 'lowpass';
    filter.frequency.value = 1200;

    source.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    gain.gain.value = volume;

    source.start();
  }

  // Stone placement — wooden clack
  function stonePlace() {
    ensureContext();
    if (!ctx) return;

    // Percussive wood-like sound
    playNoise(0.08, 0.2);
    playTone(800, 0.06, 'sine', 0.12, 0.001, 0.03);
    playTone(1200, 0.04, 'sine', 0.06, 0.001, 0.02);
  }

  // Capture — multiple stones removed
  function capture(count) {
    ensureContext();
    if (!ctx) return;

    const vol = Math.min(0.25, 0.1 + count * 0.03);
    playNoise(0.15, vol);
    playTone(600, 0.1, 'sine', 0.08);

    if (count > 2) {
      setTimeout(() => playNoise(0.1, 0.1), 50);
    }
  }

  // Pass
  function pass() {
    ensureContext();
    playTone(440, 0.15, 'sine', 0.1);
    setTimeout(() => playTone(330, 0.2, 'sine', 0.08), 100);
  }

  // Game over
  function gameOver(won) {
    ensureContext();
    if (won) {
      playTone(523, 0.2, 'sine', 0.15);
      setTimeout(() => playTone(659, 0.2, 'sine', 0.15), 150);
      setTimeout(() => playTone(784, 0.3, 'sine', 0.2), 300);
    } else {
      playTone(440, 0.3, 'sine', 0.12);
      setTimeout(() => playTone(349, 0.4, 'sine', 0.1), 200);
    }
  }

  // Error
  function error() {
    ensureContext();
    playTone(200, 0.15, 'square', 0.08);
  }

  // AI hint
  function hint() {
    ensureContext();
    playTone(880, 0.1, 'sine', 0.08);
    setTimeout(() => playTone(1100, 0.1, 'sine', 0.06), 80);
  }

  // Button
  function button() {
    ensureContext();
    playTone(600, 0.04, 'sine', 0.06);
  }

  function toggle() {
    enabled = !enabled;
    if (enabled) ensureContext();
    return enabled;
  }

  function isEnabled() { return enabled; }

  return { stonePlace, capture, pass, gameOver, error, hint, button, toggle, isEnabled, ensureContext };
})();
