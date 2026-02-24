/**
 * audio.js — Web Audio API synthesized sounds + haptic feedback
 */

let audioCtx = null;

function getAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioCtx;
}

function playTone(freq, dur, type = 'sine', vol = 0.12) {
    try {
        const ctx = getAudio();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, ctx.currentTime);
        gain.gain.setValueAtTime(vol, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + dur);
    } catch (e) { /* silent fallback */ }
}

const SFX = {
    select() {
        playTone(600, 0.08, 'sine', 0.06);
    },
    deselect() {
        playTone(400, 0.06, 'sine', 0.04);
    },
    correct() {
        playTone(523, 0.12);
        setTimeout(() => playTone(659, 0.12), 80);
        setTimeout(() => playTone(784, 0.15), 160);
    },
    wrong() {
        playTone(300, 0.15, 'square', 0.08);
        setTimeout(() => playTone(250, 0.2, 'square', 0.08), 100);
    },
    combo(n) {
        for (let i = 0; i < n; i++) {
            setTimeout(() => playTone(523 + i * 100, 0.1, 'sine', 0.1), i * 60);
        }
    },
    win() {
        [523, 587, 659, 784, 1047].forEach((f, i) =>
            setTimeout(() => playTone(f, 0.15, 'sine', 0.1), i * 80)
        );
    },
    lose() {
        [400, 350, 300, 250].forEach((f, i) =>
            setTimeout(() => playTone(f, 0.15, 'square', 0.06), i * 100)
        );
    },
    coin() {
        playTone(1200, 0.08, 'sine', 0.08);
        setTimeout(() => playTone(1600, 0.1, 'sine', 0.08), 60);
    },
    hint() {
        playTone(880, 0.1, 'triangle', 0.08);
    },
    levelUp() {
        [523, 659, 784, 1047].forEach((f, i) =>
            setTimeout(() => playTone(f, 0.12, 'sine', 0.12), i * 100)
        );
    },
    ach() {
        playTone(1047, 0.15, 'sine', 0.1);
        setTimeout(() => playTone(1318, 0.2, 'sine', 0.1), 120);
    },
};

function haptic(pattern) {
    try {
        if (Array.isArray(pattern)) {
            navigator.vibrate(pattern);
        } else {
            navigator.vibrate(pattern || 10);
        }
    } catch (e) { /* silent */ }
}
