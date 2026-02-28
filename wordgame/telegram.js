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
        switch (type) {
            case 'impact':
                TG.HapticFeedback.impactOccurred(value || 'light');
                return true;
            case 'notification':
                TG.HapticFeedback.notificationOccurred(value || 'success');
                return true;
            case 'selection':
                TG.HapticFeedback.selectionChanged();
                return true;
            default:
                TG.HapticFeedback.impactOccurred('light');
                return true;
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
}
