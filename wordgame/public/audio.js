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

function sfxHaptic(type, value, fallbackMs) {
    if (typeof tgHaptic === 'function' && typeof isTelegram !== 'undefined' && isTelegram) {
        if (tgHaptic(type, value)) return;
    }
    try { if (navigator.vibrate) navigator.vibrate(fallbackMs || 10); } catch (e) { /* silent */ }
}

const SFX = {
    select() {
        playTone(600, 0.08, 'sine', 0.06);
        sfxHaptic('selection', null, 5);
    },
    deselect() {
        playTone(400, 0.06, 'sine', 0.04);
        sfxHaptic('selection', null, 5);
    },
    correct() {
        playTone(523, 0.12);
        setTimeout(() => playTone(659, 0.12), 80);
        setTimeout(() => playTone(784, 0.15), 160);
        sfxHaptic('notification', 'success', 20);
    },
    wrong() {
        playTone(300, 0.15, 'square', 0.08);
        setTimeout(() => playTone(250, 0.2, 'square', 0.08), 100);
        sfxHaptic('notification', 'error', 30);
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
        sfxHaptic('notification', 'success', 20);
    },
    lose() {
        [400, 350, 300, 250].forEach((f, i) =>
            setTimeout(() => playTone(f, 0.15, 'square', 0.06), i * 100)
        );
        sfxHaptic('notification', 'warning', 30);
    },
    coin() {
        playTone(1200, 0.08, 'sine', 0.08);
        setTimeout(() => playTone(1600, 0.1, 'sine', 0.08), 60);
        sfxHaptic('impact', 'light', 10);
    },
    hint() {
        playTone(880, 0.1, 'triangle', 0.08);
        sfxHaptic('impact', 'soft', 10);
    },
    levelUp() {
        [523, 659, 784, 1047].forEach((f, i) =>
            setTimeout(() => playTone(f, 0.12, 'sine', 0.12), i * 100)
        );
        sfxHaptic('impact', 'heavy', 30);
    },
    ach() {
        playTone(1047, 0.15, 'sine', 0.1);
        setTimeout(() => playTone(1318, 0.2, 'sine', 0.1), 120);
        sfxHaptic('impact', 'rigid', 20);
    },
};

function haptic(pattern) {
    // Use Telegram WebApp haptics if available
    if (typeof tgHaptic === 'function' && typeof isTelegram !== 'undefined' && isTelegram) {
        let ok = false;
        if (Array.isArray(pattern)) {
            ok = tgHaptic('impact', 'medium');
        } else if (pattern >= 20) {
            ok = tgHaptic('impact', 'medium');
        } else if (pattern >= 10) {
            ok = tgHaptic('impact', 'light');
        } else {
            ok = tgHaptic('selection');
        }
        if (ok) return; // Only return if Telegram haptics actually worked
    }
    // Fallback to navigator.vibrate (browsers, or Telegram without HapticFeedback)
    try {
        if (navigator.vibrate) {
            if (Array.isArray(pattern)) {
                navigator.vibrate(pattern);
            } else {
                navigator.vibrate(pattern || 10);
            }
        }
    } catch (e) { /* silent */ }
}
