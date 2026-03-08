/**
 * duel.js — Duel mode: Socket.io matchmaking, opponent progress, bot fallback
 *
 * Depends on: save.js, game.js, ui.js, leaderboard.js (for player identity)
 */

// =============================================
// STATE
// =============================================
let duelSocket = null;
let isDuel = false;
let duelRoomId = null;
let duelOpponent = null;
let duelStartTime = 0;
let duelDifficulty = 'medium';
let duelFinished = false;
let duelResult = null;

// =============================================
// SOCKET CONNECTION
// =============================================
function connectDuelSocket() {
    if (duelSocket && duelSocket.connected) return duelSocket;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    duelSocket = io(window.location.origin);

    duelSocket.on('connect', () => {
        console.log('Duel socket connected');
    });

    duelSocket.on('duel:searching', (data) => {
        renderDuelSearching(data.waitTime);
    });

    duelSocket.on('duel:matched', (data) => {
        duelRoomId = data.roomId;
        duelOpponent = data.opponent;
        SFX.correct();
        haptic(20);
        renderDuelMatched(data);
    });

    duelSocket.on('duel:opponent-progress', (data) => {
        updateOpponentProgress(data.solved);
    });

    duelSocket.on('duel:opponent-finished', (data) => {
        showOpponentFinished(data);
    });

    duelSocket.on('duel:opponent-disconnected', () => {
        showToast('&#128683;', 'Соперник отключился');
    });

    duelSocket.on('duel:result', (data) => {
        duelResult = data;
        showDuelResult(data);
    });

    duelSocket.on('disconnect', () => {
        console.log('Duel socket disconnected');
    });

    return duelSocket;
}

// =============================================
// FIND DUEL
// =============================================
function startDuelSearch(diff) {
    duelDifficulty = diff || 'medium';
    duelFinished = false;
    duelResult = null;
    duelOpponent = null;
    duelRoomId = null;

    performDuelSearch();
}

function performDuelSearch() {
    const socket = connectDuelSocket();

    showScreen('duel-search-screen');
    renderDuelSearchStart();

    socket.emit('duel:find', {
        playerId: ensurePlayerId(),
        playerName: getPlayerName(),
        playerLevel: save.level,
        difficulty: duelDifficulty
    });
}

function cancelDuelSearch() {
    if (duelSocket) {
        duelSocket.emit('duel:cancel');
    }
    refreshHome();
    showScreen('start-screen');
}

// =============================================
// DUEL GAME LAUNCH
// =============================================
function launchDuelGame(data) {
    isDuel = true;
    duelStartTime = Date.now();
    duelFinished = false;

    // Use the puzzle determined by the server
    const puzzleData = data.puzzle;
    difficulty = puzzleData.difficulty;
    const puzzles = WORD_PUZZLES.filter(p => p.difficulty === difficulty);
    const idx = puzzleData.puzzleIndex % puzzles.length;

    puzzleIndex = idx;
    puzzle = puzzles[idx];
    isEndless = false;
    maxMist = DIFF_META[difficulty].attempts;

    initRound();

    // Show opponent indicator
    showDuelOverlay();
}

// =============================================
// DUEL PROGRESS REPORTING
// =============================================
function reportDuelProgress() {
    if (!isDuel || !duelSocket || !duelRoomId) return;

    duelSocket.emit('duel:progress', {
        roomId: duelRoomId,
        solved: solvedCats.length
    });
}

function reportDuelFinished(won, stars) {
    if (!isDuel || !duelSocket || !duelRoomId || duelFinished) return;
    duelFinished = true;

    const elapsed = getElapsed();
    duelSocket.emit('duel:finished', {
        roomId: duelRoomId,
        won,
        time: elapsed,
        stars
    });
}

// =============================================
// DUEL UI — SEARCH SCREEN
// =============================================
function renderDuelSearchStart() {
    const content = $('duel-search-content');
    if (!content) return;

    const diffMeta = DIFF_META[duelDifficulty];
    content.innerHTML = `
        <div class="duel-search-anim">
            <div class="duel-search-ring"></div>
            <div class="duel-search-icon">&#9876;</div>
        </div>
        <div class="duel-search-title">Поиск соперника...</div>
        <div class="duel-search-diff">
            <span class="badge ${diffMeta.color}">${diffMeta.label}</span>
        </div>
        <div class="duel-search-sub">Если соперник не найден за 10 секунд,<br>вы сыграете с ботом</div>
        <div class="duel-search-timer" id="duel-timer">10</div>
        <button class="pill-btn" onclick="cancelDuelSearch()">Отмена</button>
    `;

    // Countdown
    let count = 10;
    const timerEl = $('duel-timer');
    const interval = setInterval(() => {
        count--;
        if (timerEl) timerEl.textContent = count;
        if (count <= 0) clearInterval(interval);
    }, 1000);
    window._duelSearchInterval = interval;
}

function renderDuelSearching(waitTime) {
    // Already showing search animation
}

function renderDuelMatched(data) {
    clearInterval(window._duelSearchInterval);

    const content = $('duel-search-content');
    if (!content) return;

    const opp = data.opponent;
    content.innerHTML = `
        <div class="duel-matched-anim">
            <div class="duel-vs">
                <div class="duel-player-card">
                    <div class="duel-player-avatar">&#128100;</div>
                    <div class="duel-player-name">${escapeHtml(getPlayerName())}</div>
                    <div class="duel-player-level">Ур. ${save.level}</div>
                </div>
                <div class="duel-vs-text">VS</div>
                <div class="duel-player-card">
                    <div class="duel-player-avatar">${opp.isBot ? '&#129302;' : '&#128100;'}</div>
                    <div class="duel-player-name">${escapeHtml(opp.name)}</div>
                    <div class="duel-player-level">Ур. ${opp.level}${opp.isBot ? ' (бот)' : ''}</div>
                </div>
            </div>
        </div>
        <div class="duel-matched-title">Соперник найден!</div>
        <div class="duel-matched-sub">Игра начнётся через...</div>
        <div class="duel-countdown" id="duel-countdown">3</div>
    `;

    // Countdown to start
    let count = 3;
    const countEl = $('duel-countdown');
    const interval = setInterval(() => {
        count--;
        if (countEl) countEl.textContent = count;
        if (count <= 0) {
            clearInterval(interval);
            launchDuelGame(data);
        }
    }, 1000);
}

// =============================================
// DUEL OVERLAY DURING GAME
// =============================================
function showDuelOverlay() {
    let overlay = $('duel-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'duel-overlay';
        overlay.className = 'duel-game-overlay';
        document.getElementById('game-screen').prepend(overlay);
    }

    const opp = duelOpponent;
    overlay.innerHTML = `
        <div class="duel-opp-bar">
            <span class="duel-opp-icon">${opp && opp.isBot ? '&#129302;' : '&#128100;'}</span>
            <span class="duel-opp-name">${opp ? escapeHtml(opp.name) : 'Соперник'}</span>
            <div class="duel-opp-progress">
                <div class="duel-opp-dots" id="duel-opp-dots">
                    <span class="duel-dot"></span>
                    <span class="duel-dot"></span>
                    <span class="duel-dot"></span>
                    <span class="duel-dot"></span>
                </div>
            </div>
        </div>`;
    overlay.style.display = 'flex';
}

function hideDuelOverlay() {
    const overlay = $('duel-overlay');
    if (overlay) overlay.style.display = 'none';
}

function updateOpponentProgress(solved) {
    const dots = document.querySelectorAll('#duel-opp-dots .duel-dot');
    dots.forEach((dot, i) => {
        dot.classList.toggle('solved', i < solved);
    });
}

function showOpponentFinished(data) {
    if (data.won) {
        showMsg('Соперник закончил!', 'warn');
    }
}

// =============================================
// DUEL RESULT
// =============================================
function showDuelResult(data) {
    const myId = ensurePlayerId();
    const iWon = data.winnerId === myId;
    const isDraw = data.isDraw;

    // Update duel wins
    if (iWon && !isDraw) {
        save.duelWins = (save.duelWins || 0) + 1;
        writeSave(save);
    }

    // Submit updated stats
    submitToLeaderboard();

    // Build result HTML in the result screen
    const duelEl = $('res-duel');
    if (!duelEl) return;

    let html = '';
    if (isDraw) {
        html = `
            <div class="duel-result-card draw">
                <div class="duel-result-icon">&#129309;</div>
                <div class="duel-result-title">Ничья!</div>
            </div>`;
    } else {
        html = `
            <div class="duel-result-card ${iWon ? 'win' : 'lose'}">
                <div class="duel-result-icon">${iWon ? '&#127942;' : '&#128546;'}</div>
                <div class="duel-result-title">${iWon ? 'Вы победили!' : 'Вы проиграли'}</div>
                <div class="duel-result-details">
                    <div class="duel-detail">
                        <span>${escapeHtml(data.winnerName || '')}</span>
                        <span>${formatDuelTime(data.winnerTime)} ${'⭐'.repeat(data.winnerStars)}</span>
                    </div>
                    <div class="duel-detail">
                        <span>${escapeHtml(data.loserName || '')}</span>
                        <span>${formatDuelTime(data.loserTime)} ${'⭐'.repeat(data.loserStars)}</span>
                    </div>
                </div>
            </div>`;
    }

    duelEl.innerHTML = html;

    // Sound
    if (iWon && !isDraw) {
        SFX.win();
    }

    // Clean up duel state
    hideDuelOverlay();
    isDuel = false;
}

function formatDuelTime(seconds) {
    if (!seconds || seconds >= 999) return '--:--';
    const m = Math.floor(seconds / 60);
    const s = String(seconds % 60).padStart(2, '0');
    return `${m}:${s}`;
}

// =============================================
// DUEL DIFFICULTY PICKER
// =============================================
function showDuelDiffPicker() {
    showScreen('duel-pick-screen');

    const grid = $('duel-diff-grid');
    if (!grid) return;

    grid.innerHTML = '';
    for (const [key, meta] of Object.entries(DIFF_META)) {
        const btn = document.createElement('button');
        btn.className = 'diff-btn';
        btn.innerHTML = `
            <span class="diff-left"><span class="diff-dot ${key}"></span>${meta.label}</span>
            <span class="diff-info"><span class="diff-attempts">&#9876; Дуэль</span></span>`;
        btn.onclick = () => startDuelSearch(key);
        grid.appendChild(btn);
    }
}
