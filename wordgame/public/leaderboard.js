/**
 * leaderboard.js — Leaderboard frontend: fetch, render, submit scores
 *
 * Depends on: save.js, ui.js
 */

// =============================================
// PLAYER IDENTITY
// =============================================
function ensurePlayerId() {
    if (!save.playerId) {
        save.playerId = 'p_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
        writeSave(save);
    }
    return save.playerId;
}

function getPlayerName() {
    return save.playerName || 'Игрок';
}

function setPlayerName(name) {
    save.playerName = String(name).trim().slice(0, 20) || 'Игрок';
    writeSave(save);
}

// =============================================
// CALCULATE TOTAL STARS
// =============================================
function calcTotalStars() {
    let total = 0;
    for (const key in save.completedPuzzles) {
        total += save.completedPuzzles[key] || 0;
    }
    return total;
}

// =============================================
// SUBMIT TO LEADERBOARD
// =============================================
async function submitToLeaderboard() {
    const id = ensurePlayerId();
    const name = getPlayerName();

    // Resolve avatar icon for leaderboard
    const avatarItem = save.equippedAvatar && typeof SHOP_ITEMS !== 'undefined'
        ? SHOP_ITEMS.find(i => i.id === save.equippedAvatar)
        : null;
    const avatarIcon = avatarItem ? avatarItem.icon : null;

    try {
        await fetch('/api/leaderboard', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id,
                name,
                avatar: avatarIcon,
                xp: (save.level - 1) * 200 + save.xp,
                level: save.level,
                totalStars: calcTotalStars(),
                bestStreak: save.bestStreak,
                currentStreak: save.currentStreak,
                dailyStreak: save.dailyStreak || 0,
                totalWins: save.totalWins,
                totalGames: save.totalGames,
                perfectGames: save.perfectGames,
                duelWins: save.duelWins || 0,
                categoriesFound: save.categoriesFound || 0,
                dailyPuzzlesTotal: save.dailyPuzzlesTotal || 0,
                weeklyPuzzlesTotal: save.weeklyPuzzlesTotal || 0
            })
        });
    } catch (e) {
        console.warn('Leaderboard submit failed:', e.message);
    }
}

// =============================================
// FETCH LEADERBOARD
// =============================================
let currentLeaderboardSort = 'xp';
let lastLeaderboardData = null;
let lastLeaderboardMyRank = -1;

async function fetchLeaderboard(sort = 'xp') {
    try {
        const res = await fetch(`/api/leaderboard?sort=${sort}&limit=50`);
        const data = await res.json();
        return data;
    } catch (e) {
        console.warn('Leaderboard fetch failed:', e.message);
        return { players: [], total: 0 };
    }
}

// =============================================
// RENDER LEADERBOARD SCREEN
// =============================================
async function refreshLeaderboard(sort) {
    if (sort) currentLeaderboardSort = sort;

    const content = $('lb-content');
    if (!content) return;

    // Show loading
    content.innerHTML = '<div class="lb-loading">Загрузка...</div>';

    // Update tab active states
    document.querySelectorAll('.lb-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.sort === currentLeaderboardSort);
    });

    // Weekly speed leaderboard is a separate flow
    if (currentLeaderboardSort === 'weekly') {
        await renderWeeklySpeedLeaderboard(content);
        return;
    }

    const data = await fetchLeaderboard(currentLeaderboardSort);
    const myId = ensurePlayerId();
    lastLeaderboardData = data;
    lastLeaderboardMyRank = data.players.findIndex(p => p.id === myId) + 1;

    if (!data.players.length) {
        content.innerHTML = '<div class="lb-empty">Пока нет игроков. Будь первым!</div>';
        return;
    }

    const sortLabels = {
        xp: 'Уровень', streak: 'Стрик', duels: 'Дуэли'
    };

    let html = '';
    data.players.forEach((player, i) => {
        const rank = i + 1;
        const isMe = player.id === myId;
        const medal = rank === 1 ? '&#129351;' : rank === 2 ? '&#129352;' : rank === 3 ? '&#129353;' : '';

        let statValue = '';
        switch (currentLeaderboardSort) {
            case 'xp':     statValue = `Ур. ${player.level} (${player.xp} XP)`; break;
            case 'streak': statValue = `${player.bestStreak} подряд`; break;
            case 'duels':  statValue = `${player.duelWins || 0} побед`; break;
        }

        const avatarHtml = player.avatar
            ? `<span class="lb-avatar">${player.avatar}</span>`
            : `<span class="lb-avatar">&#128100;</span>`;

        html += `
            <div class="lb-row ${isMe ? 'lb-me' : ''}">
                <div class="lb-rank">${medal || rank}</div>
                ${avatarHtml}
                <div class="lb-player">
                    <div class="lb-name">${escapeHtml(player.name)}</div>
                    <div class="lb-stat-sub">${player.totalWins} побед &middot; ${player.totalGames} игр</div>
                </div>
                <div class="lb-value">${statValue}</div>
            </div>`;
    });

    content.innerHTML = html;
}

// =============================================
// WEEKLY SPEED LEADERBOARD
// =============================================
async function fetchWeeklySpeedLeaderboard(weekId) {
    try {
        const res = await fetch(`/api/weekly-speed?weekId=${weekId}&limit=50`);
        return await res.json();
    } catch (e) {
        console.warn('Weekly speed fetch failed:', e.message);
        return { players: [], total: 0 };
    }
}

function formatSpeedTime(seconds) {
    const min = Math.floor(seconds / 60);
    const sec = String(seconds % 60).padStart(2, '0');
    return `${min}:${sec}`;
}

async function renderWeeklySpeedLeaderboard(content) {
    const weekId = typeof getWeekId === 'function' ? getWeekId() : '';
    const data = await fetchWeeklySpeedLeaderboard(weekId);
    const myId = ensurePlayerId();

    if (!data.players || !data.players.length) {
        content.innerHTML = '<div class="lb-empty">Ещё никто не прошёл недельный паззл. Будь первым!</div>';
        return;
    }

    let html = '<div class="lb-weekly-header">&#9889; Скорость прохождения недельного паззла</div>';
    data.players.forEach((player, i) => {
        const rank = i + 1;
        const isMe = player.id === myId;
        const medal = rank === 1 ? '&#129351;' : rank === 2 ? '&#129352;' : rank === 3 ? '&#129353;' : '';

        const wAvatarHtml = player.avatar
            ? `<span class="lb-avatar">${player.avatar}</span>`
            : `<span class="lb-avatar">&#128100;</span>`;

        html += `
            <div class="lb-row ${isMe ? 'lb-me' : ''}">
                <div class="lb-rank">${medal || rank}</div>
                ${wAvatarHtml}
                <div class="lb-player">
                    <div class="lb-name">${escapeHtml(player.name)}</div>
                </div>
                <div class="lb-value">${formatSpeedTime(player.time)}</div>
            </div>`;
    });

    content.innerHTML = html;
}

// =============================================
// HELPERS
// =============================================
function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
