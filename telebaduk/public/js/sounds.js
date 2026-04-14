// Sounds - Web Audio API synthesized Go sounds
const Sounds = (() => {
  let ctx = null;
  let enabled = true;

  function getCtx() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone(freq, duration, type = 'sine', volume = 0.15) {
    if (!enabled) return;
    const c = getCtx();
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(volume, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
    osc.connect(gain).connect(c.destination);
    osc.start();
    osc.stop(c.currentTime + duration);
  }

  function noise(duration, volume = 0.1) {
    if (!enabled) return;
    const c = getCtx();
    const bufSize = c.sampleRate * duration;
    const buf = c.createBuffer(1, bufSize, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufSize * 0.3));
    }
    const src = c.createBufferSource();
    src.buffer = buf;
    const gain = c.createGain();
    gain.gain.setValueAtTime(volume, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
    const filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1200;
    src.connect(filter).connect(gain).connect(c.destination);
    src.start();
  }

  function stonePlace() {
    noise(0.08, 0.2);
    tone(220, 0.06, 'sine', 0.08);
  }

  function capture(count) {
    noise(0.12, 0.25);
    tone(330, 0.1, 'sine', 0.1);
    if (count > 2) {
      setTimeout(() => tone(440, 0.08, 'sine', 0.07), 60);
    }
    if (count > 4) {
      setTimeout(() => noise(0.08, 0.15), 120);
    }
  }

  function pass() {
    tone(440, 0.15, 'sine', 0.08);
    setTimeout(() => tone(330, 0.2, 'sine', 0.06), 100);
  }

  function gameStart() {
    tone(523, 0.15, 'sine', 0.1);
    setTimeout(() => tone(659, 0.15, 'sine', 0.1), 120);
    setTimeout(() => tone(784, 0.2, 'sine', 0.12), 240);
  }

  function gameWin() {
    [523, 659, 784, 1047].forEach((f, i) => {
      setTimeout(() => tone(f, 0.3, 'sine', 0.12), i * 150);
    });
  }

  function gameLose() {
    tone(220, 0.4, 'sine', 0.08);
    setTimeout(() => tone(196, 0.5, 'sine', 0.06), 200);
  }

  function redo() {
    tone(660, 0.1, 'triangle', 0.08);
    setTimeout(() => tone(550, 0.1, 'triangle', 0.06), 80);
  }

  function error() {
    tone(200, 0.15, 'square', 0.06);
  }

  function toggle() {
    enabled = !enabled;
    return enabled;
  }

  return { stonePlace, capture, pass, gameStart, gameWin, gameLose, redo, error, toggle, get enabled() { return enabled; } };
})();
