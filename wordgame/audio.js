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
        if (typeof tgHaptic === 'function' && isTelegram) tgHaptic('selection');
    },
    deselect() {
        playTone(400, 0.06, 'sine', 0.04);
        if (typeof tgHaptic === 'function' && isTelegram) tgHaptic('selection');
    },
    correct() {
        playTone(523, 0.12);
        setTimeout(() => playTone(659, 0.12), 80);
        setTimeout(() => playTone(784, 0.15), 160);
        if (typeof tgHaptic === 'function' && isTelegram) tgHaptic('notification', 'success');
    },
    wrong() {
        playTone(300, 0.15, 'square', 0.08);
        setTimeout(() => playTone(250, 0.2, 'square', 0.08), 100);
        if (typeof tgHaptic === 'function' && isTelegram) tgHaptic('notification', 'error');
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
        if (typeof tgHaptic === 'function' && isTelegram) tgHaptic('notification', 'success');
    },
    lose() {
        [400, 350, 300, 250].forEach((f, i) =>
            setTimeout(() => playTone(f, 0.15, 'square', 0.06), i * 100)
        );
        if (typeof tgHaptic === 'function' && isTelegram) tgHaptic('notification', 'warning');
    },
    coin() {
        playTone(1200, 0.08, 'sine', 0.08);
        setTimeout(() => playTone(1600, 0.1, 'sine', 0.08), 60);
        if (typeof tgHaptic === 'function' && isTelegram) tgHaptic('impact', 'light');
    },
    hint() {
        playTone(880, 0.1, 'triangle', 0.08);
        if (typeof tgHaptic === 'function' && isTelegram) tgHaptic('impact', 'soft');
    },
    levelUp() {
        [523, 659, 784, 1047].forEach((f, i) =>
            setTimeout(() => playTone(f, 0.12, 'sine', 0.12), i * 100)
        );
        if (typeof tgHaptic === 'function' && isTelegram) tgHaptic('impact', 'heavy');
    },
    ach() {
        playTone(1047, 0.15, 'sine', 0.1);
        setTimeout(() => playTone(1318, 0.2, 'sine', 0.1), 120);
        if (typeof tgHaptic === 'function' && isTelegram) tgHaptic('impact', 'rigid');
    },
};

function haptic(pattern) {
    // Use Telegram WebApp haptics if available
    if (typeof tgHaptic === 'function' && typeof isTelegram !== 'undefined' && isTelegram) {
        if (Array.isArray(pattern)) {
            // Complex pattern → medium impact
            tgHaptic('impact', 'medium');
        } else if (pattern >= 20) {
            tgHaptic('impact', 'medium');
        } else if (pattern >= 10) {
            tgHaptic('impact', 'light');
        } else {
            tgHaptic('selection');
        }
        return;
    }
    // Fallback to navigator.vibrate
    try {
        if (Array.isArray(pattern)) {
            navigator.vibrate(pattern);
        } else {
            navigator.vibrate(pattern || 10);
        }
    } catch (e) { /* silent */ }
}
