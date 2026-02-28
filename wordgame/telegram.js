/**
 * telegram.js — Telegram WebApp integration
 *
 * Handles:
 * - Auto-expand to fullscreen
 * - Haptic feedback via Telegram API
 * - BackButton / MainButton navigation
 * - Player identity from Telegram user data
 *
 * Must be loaded AFTER save.js but BEFORE ui.js
 */

// =============================================
// TELEGRAM WEBAPP DETECTION
// =============================================
const TG = window.Telegram && window.Telegram.WebApp;
const isTelegram = !!TG;

// =============================================
// FULLSCREEN EXPAND
// =============================================
function tgExpand() {
    if (!TG) return;
    // First expand to maximum available height
    TG.expand();
    // Then request true fullscreen if available (Telegram Bot API 8.0+)
    if (typeof TG.requestFullscreen === 'function') {
        try {
            TG.requestFullscreen();
        } catch (e) {
            // Fullscreen not supported in this version, expand() is enough
        }
    }
    // Disable vertical swipe to close so the app stays fullscreen
    if (typeof TG.disableVerticalSwipes === 'function') {
        try {
            TG.disableVerticalSwipes();
        } catch (e) { /* silent */ }
    }
}

// =============================================
// SAFE AREA INSETS (fullscreen top offset)
// =============================================
function tgApplySafeArea() {
    if (!TG) return;
    // Telegram exposes two insets in fullscreen:
    //   safeAreaInset — device safe area (notch, status bar)
    //   contentSafeAreaInset — Telegram UI (close button, settings)
    const device = TG.safeAreaInset || {};
    const content = TG.contentSafeAreaInset || {};
    const top = (device.top || 0) + (content.top || 0);
    document.documentElement.style.setProperty('--safe-top', top + 'px');
}

function tgListenSafeArea() {
    if (!TG) return;
    // Apply once immediately
    tgApplySafeArea();
    // Re-apply when Telegram reports changes (orientation, fullscreen toggle)
    if (TG.onEvent) {
        try { TG.onEvent('safeAreaChanged', tgApplySafeArea); } catch (e) { /* silent */ }
        try { TG.onEvent('contentSafeAreaChanged', tgApplySafeArea); } catch (e) { /* silent */ }
        try { TG.onEvent('fullscreenChanged', tgApplySafeArea); } catch (e) { /* silent */ }
    }
}

// =============================================
// HAPTIC FEEDBACK
// =============================================
/**
 * Telegram HapticFeedback types:
 *   impactOccurred(style): 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'
 *   notificationOccurred(type): 'error' | 'success' | 'warning'
 *   selectionChanged()
 */
function tgHaptic(type, value) {
    if (!TG || !TG.HapticFeedback) return false;
    try {
        const hf = TG.HapticFeedback;
        switch (type) {
            case 'impact':
                if (typeof hf.impactOccurred === 'function') {
                    hf.impactOccurred(value || 'light');
                    return true;
                }
                return false;
            case 'notification':
                if (typeof hf.notificationOccurred === 'function') {
                    hf.notificationOccurred(value || 'success');
                    return true;
                }
                return false;
            case 'selection':
                if (typeof hf.selectionChanged === 'function') {
                    hf.selectionChanged();
                    return true;
                }
                return false;
            default:
                if (typeof hf.impactOccurred === 'function') {
                    hf.impactOccurred('light');
                    return true;
                }
                return false;
        }
    } catch (e) {
        return false;
    }
}

// =============================================
// BACK BUTTON NAVIGATION
// =============================================
let _currentScreen = 'start-screen';
const _screenHistory = ['start-screen'];

function tgUpdateBackButton() {
    if (!TG || !TG.BackButton) return;
    if (_currentScreen === 'start-screen') {
        TG.BackButton.hide();
    } else {
        TG.BackButton.show();
    }
}

function tgOnBackPressed() {
    // Navigate back based on current screen
    switch (_currentScreen) {
        case 'game-screen':
            // Trigger the existing game-back logic
            const gameBack = document.getElementById('game-back');
            if (gameBack) gameBack.click();
            break;
        case 'result-screen':
            refreshHome();
            showScreen('start-screen');
            break;
        case 'profile-screen':
            refreshHome();
            showScreen('start-screen');
            break;
        case 'archive-screen':
            refreshProfile();
            showScreen('profile-screen');
            break;
        case 'lb-screen':
            refreshHome();
            showScreen('start-screen');
            break;
        case 'duel-pick-screen':
            refreshHome();
            showScreen('start-screen');
            break;
        case 'duel-search-screen':
            if (typeof cancelDuelSearch === 'function') cancelDuelSearch();
            else { refreshHome(); showScreen('start-screen'); }
            break;
        default:
            refreshHome();
            showScreen('start-screen');
    }
}

function tgInitBackButton() {
    if (!TG || !TG.BackButton) return;
    TG.BackButton.onClick(tgOnBackPressed);
    tgUpdateBackButton();
}

// =============================================
// TELEGRAM USER IDENTITY
// =============================================
function tgInitUser() {
    if (!TG || !TG.initDataUnsafe || !TG.initDataUnsafe.user) return;
    const user = TG.initDataUnsafe.user;

    // Always sync player name from Telegram profile
    if (user.first_name) {
        const name = user.first_name + (user.last_name ? ' ' + user.last_name : '');
        save.playerName = name.slice(0, 20);
        writeSave(save);
    }

    // Use Telegram user ID as stable player ID
    if (user.id) {
        const tgId = 'tg_' + user.id;
        if (save.playerId !== tgId) {
            save.playerId = tgId;
            writeSave(save);
        }
    }
}

// =============================================
// THEME SYNC
// =============================================
function tgSyncTheme() {
    if (!TG) return;
    // Set header color to match game theme
    if (typeof TG.setHeaderColor === 'function') {
        try { TG.setHeaderColor('#0f0f13'); } catch (e) { /* silent */ }
    }
    if (typeof TG.setBackgroundColor === 'function') {
        try { TG.setBackgroundColor('#0f0f13'); } catch (e) { /* silent */ }
    }
}

// =============================================
// SIGNAL READY
// =============================================
function tgReady() {
    if (!TG) return;
    if (typeof TG.ready === 'function') {
        TG.ready();
    }
}

// =============================================
// INIT ALL TELEGRAM FEATURES
// =============================================
function initTelegram() {
    if (!isTelegram) return;

    tgReady();
    tgExpand();
    tgSyncTheme();
    tgInitUser();
    tgInitBackButton();
    tgListenSafeArea();
}
