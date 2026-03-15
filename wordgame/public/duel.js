/**
 * duel.js — Duel mode: Socket.io lobby system, matchmaking, opponent progress
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
let duelDifficulty = 'hard';
let duelFinished = false;
let duelResult = null;
let duelMyLobbyId = null; // lobby I created (waiting for opponent)
let duelBetInfo = null;   // { isBet, betAmount } for current duel
let duelInactivityInterval = null; // track inactivity during game

// =============================================
// SOCKET CONNECTION
// =============================================
function connectDuelSocket() {
    if (duelSocket && duelSocket.connected) return duelSocket;

    duelSocket = io(window.location.origin);

    duelSocket.on('connect', () => {
        console.log('Duel socket connected');
        // Check for pending duels on reconnect
        duelSocket.emit('duel:check-pending', { playerId: ensurePlayerId() });
        // Restore duel button state
        if (duelMyLobbyId) {
            updateDuelButtonState(true);
        }
    });

    duelSocket.on('duel:searching', (data) => {
        renderDuelSearching(data.waitTime);
    });

    duelSocket.on('duel:matched', (data) => {
        duelRoomId = data.roomId;
        duelOpponent = data.opponent;
        duelBetInfo = { isBet: data.isBet || false, betAmount: data.betAmount || 0 };
        SFX.correct();
        haptic(20);

        // If I was in lobby waiting, clear it
        if (duelMyLobbyId) {
            duelMyLobbyId = null;
            updateDuelButtonState(false);
        }

        renderDuelMatched(data);
    });

    duelSocket.on('duel:opponent-progress', (data) => {
        updateOpponentProgress(data.solved);
    });

    duelSocket.on('duel:opponent-finished', (data) => {
        showOpponentFinished(data);
        // If opponent won, start countdown UI
        if (data.won && data.countdown && !duelFinished) {
            startDuelCountdown(data.countdown);
        }
    });

    duelSocket.on('duel:opponent-disconnected', () => {
        showToast('&#128683;', 'Соперник отключился');
    });

    duelSocket.on('duel:opponent-inactive', () => {
        showToast('&#127942;', 'Соперник неактивен — вы побеждаете!');
    });

    duelSocket.on('duel:inactivity-lose', () => {
        showToast('&#128683;', 'Вы проиграли из-за неактивности');
    });

    duelSocket.on('duel:result', (data) => {
        duelResult = data;
        clearDuelInactivityTracking();
        clearDuelCountdown();
        showDuelResult(data);
    });

    duelSocket.on('duel:lobby-created', (data) => {
        duelMyLobbyId = data.roomId;
        updateDuelButtonState(true);
        // When on duel-pick-screen, show the cancel button state
        if (_currentScreen === 'duel-pick-screen') {
            renderDuelLobbyScreen();
        }
    });

    duelSocket.on('duel:lobbies-updated', (lobbies) => {
        renderDuelLobbiesList(lobbies);
    });

    duelSocket.on('duel:lobby-error', (data) => {
        showToast('&#128683;', data.error || 'Ошибка');
    });

    // Someone accepted my duel and is challenging me
    duelSocket.on('duel:challenge-received', (data) => {
        // If we're anywhere in the app, show the challenge notification
        showDuelChallengeAlert(data);
    });

    // Waiting for creator to accept (I joined someone's lobby)
    duelSocket.on('duel:waiting-for-creator', (data) => {
        renderDuelWaitingForCreator(data);
    });

    // Creator didn't show up in time — I win
    duelSocket.on('duel:acceptance-timeout', (data) => {
        if (data.youWin) {
            showToast('&#127942;', 'Соперник не появился — вы победили!');
            // Update duel wins
            save.duelWins = (save.duelWins || 0) + 1;
            writeSave(save);
            if (typeof submitToLeaderboard === 'function') submitToLeaderboard();
        }
        showDuelLobby();
    });

    // My lobby was cancelled by me (or I got notified)
    duelSocket.on('duel:lobby-cancelled', (data) => {
        showToast('&#128683;', `${data.creatorName} отменил дуэль`);
        duelMyLobbyId = null;
        updateDuelButtonState(false);
        showDuelLobby();
    });

    // Joiner left the pending lobby
    duelSocket.on('duel:joiner-left', (data) => {
        showToast('&#128683;', 'Соперник ушёл');
        // Lobby is still active, go back to lobby screen
        if (_currentScreen === 'duel-pick-screen') {
            renderDuelLobbyScreen();
        }
    });

    duelSocket.on('disconnect', () => {
        console.log('Duel socket disconnected');
        // Don't clear duelMyLobbyId — lobby persists on server
    });

    return duelSocket;
}

// =============================================
// DUEL LOBBY (new system)
// =============================================
function showDuelLobby() {
    showScreen('duel-pick-screen');
    const socket = connectDuelSocket();
    socket.emit('duel:get-lobbies');
    renderDuelLobbyScreen();
}

function renderDuelLobbyScreen() {
    const container = $('duel-lobby-container');
    if (!container) return;

    const hasMyLobby = !!duelMyLobbyId;

    let buttonHtml;
    if (hasMyLobby) {
        buttonHtml = `<button class="pill-btn duel-cancel-active-btn" id="duel-cancel-active-btn">&#10060; Отменить дуэль</button>`;
    } else {
        buttonHtml = `<button class="pill-btn primary duel-create-btn" id="duel-create-btn">&#9876; Создать дуэль</button>`;
    }

    container.innerHTML = `
        <div class="duel-lobby-rules">
            <span class="duel-lobby-rules-icon">&#9432;</span>
            Если вы не в приложении, у вас будет 2 минуты чтобы принять вызов.
        </div>
        ${buttonHtml}
        <div class="duel-lobby-title">Открытые дуэли</div>
        <div class="duel-lobbies-list" id="duel-lobbies-list">
            <div class="duel-lobbies-empty">Загрузка...</div>
        </div>
    `;

    if (hasMyLobby) {
        container.querySelector('#duel-cancel-active-btn').onclick = () => {
            if (duelSocket && duelMyLobbyId) {
                duelSocket.emit('duel:cancel-lobby', { roomId: duelMyLobbyId, playerId: ensurePlayerId() });
            }
            duelMyLobbyId = null;
            updateDuelButtonState(false);
            renderDuelLobbyScreen();
        };
    } else {
        container.querySelector('#duel-create-btn').onclick = () => showCreateDuelDialog();
    }
}

function showCreateDuelDialog() {
    const container = $('duel-lobby-container');
    if (!container) return;

    container.innerHTML = `
        <div class="duel-create-dialog">
            <div class="duel-create-title">Создать дуэль</div>
            <div class="duel-create-section">
                <div class="duel-create-label">Тип матча</div>
                <div class="duel-create-options" id="duel-type-options">
                    <button class="duel-option-btn active" data-type="friendly">&#129309; Дружеский матч</button>
                    <button class="duel-option-btn" data-type="bet">&#9679; На ставку</button>
                </div>
            </div>
            <div class="duel-bet-section" id="duel-bet-section" style="display:none">
                <div class="duel-create-label">Ставка (монеты)</div>
                <div class="duel-bet-amounts" id="duel-bet-amounts">
                    <button class="duel-bet-btn active" data-amount="10">10</button>
                    <button class="duel-bet-btn" data-amount="25">25</button>
                    <button class="duel-bet-btn" data-amount="50">50</button>
                    <button class="duel-bet-btn" data-amount="100">100</button>
                </div>
                <div class="duel-bet-info">Ваши монеты: <span class="coin-icon">&#9679;</span> ${save.coins}</div>
            </div>
            <div class="duel-create-actions">
                <button class="pill-btn primary" id="duel-confirm-create">Создать</button>
                <button class="pill-btn" id="duel-cancel-create">Назад</button>
            </div>
        </div>
    `;

    let selectedType = 'friendly';
    let selectedBet = 10;

    // Type toggle
    container.querySelectorAll('#duel-type-options .duel-option-btn').forEach(btn => {
        btn.onclick = () => {
            container.querySelectorAll('#duel-type-options .duel-option-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            selectedType = btn.dataset.type;
            $('duel-bet-section').style.display = selectedType === 'bet' ? 'block' : 'none';
        };
    });

    // Bet amounts
    container.querySelectorAll('#duel-bet-amounts .duel-bet-btn').forEach(btn => {
        btn.onclick = () => {
            container.querySelectorAll('#duel-bet-amounts .duel-bet-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            selectedBet = Number(btn.dataset.amount);
        };
    });

    container.querySelector('#duel-confirm-create').onclick = () => {
        const isBet = selectedType === 'bet';
        if (isBet && save.coins < selectedBet) {
            showToast('&#128683;', 'Недостаточно монет!');
            return;
        }
        createDuelLobby(isBet, selectedBet);
    };

    container.querySelector('#duel-cancel-create').onclick = () => showDuelLobby();
}

function createDuelLobby(isBet, betAmount) {
    const socket = connectDuelSocket();
    duelDifficulty = 'hard';
    duelFinished = false;
    duelResult = null;
    duelOpponent = null;
    duelRoomId = null;

    // Get Telegram chat ID for notifications
    let chatId = null;
    if (typeof TG !== 'undefined' && TG && TG.initDataUnsafe && TG.initDataUnsafe.user) {
        chatId = TG.initDataUnsafe.user.id;
    }

    socket.emit('duel:create-lobby', {
        playerId: ensurePlayerId(),
        playerName: getPlayerName(),
        playerLevel: save.level,
        difficulty: duelDifficulty,
        isBet,
        betAmount: isBet ? betAmount : 0,
        chatId
    });
}

function renderDuelLobbiesList(lobbies) {
    const list = $('duel-lobbies-list');
    if (!list) return;

    const myId = ensurePlayerId();
    // Filter out my own lobby
    const otherLobbies = lobbies.filter(l => l.creatorId !== myId);

    if (!otherLobbies.length) {
        list.innerHTML = '<div class="duel-lobbies-empty">Пока нет открытых дуэлей</div>';
        return;
    }

    let html = '';
    otherLobbies.forEach(lobby => {
        const typeLabel = lobby.isBet
            ? `<span class="duel-lobby-bet">&#9679; ${lobby.betAmount} монет</span>`
            : '<span class="duel-lobby-friendly">&#129309; Дружеский</span>';
        html += `
            <div class="duel-lobby-card" data-room="${lobby.roomId}">
                <div class="duel-lobby-player">
                    <span class="duel-lobby-avatar">&#128100;</span>
                    <div class="duel-lobby-info">
                        <div class="duel-lobby-name">${escapeHtml(lobby.creatorName)} хочет сразиться!</div>
                        <div class="duel-lobby-meta">Ур. ${lobby.creatorLevel} ${typeLabel}</div>
                    </div>
                </div>
                <button class="pill-btn primary duel-join-btn">Принять вызов</button>
            </div>`;
    });

    list.innerHTML = html;

    // Bind join handlers
    list.querySelectorAll('.duel-lobby-card').forEach(card => {
        const roomId = card.dataset.room;
        const lobby = otherLobbies.find(l => l.roomId === roomId);
        card.querySelector('.duel-join-btn').onclick = () => {
            if (lobby && lobby.isBet && save.coins < lobby.betAmount) {
                showToast('&#128683;', `Нужно ${lobby.betAmount} монет для ставки!`);
                return;
            }
            joinDuelLobby(roomId);
        };
    });
}

function joinDuelLobby(roomId) {
    const socket = connectDuelSocket();
    socket.emit('duel:join-lobby', {
        roomId,
        playerId: ensurePlayerId(),
        playerName: getPlayerName(),
        playerLevel: save.level
    });
}

// =============================================
// WAITING FOR CREATOR (after joining offline creator's lobby)
// =============================================
function renderDuelWaitingForCreator(data) {
    showScreen('duel-search-screen');
    const content = $('duel-search-content');
    if (!content) return;

    content.innerHTML = `
        <div class="duel-search-anim">
            <div class="duel-search-ring"></div>
            <div class="duel-search-icon">&#9876;</div>
        </div>
        <div class="duel-search-title">Ожидание ${escapeHtml(data.creatorName)}...</div>
        <div class="duel-search-sub">Оповещение отправлено в Telegram.<br>У соперника 2 минуты чтобы принять вызов.</div>
        <div class="duel-search-timer" id="duel-wait-timer">2:00</div>
        <button class="pill-btn" id="duel-cancel-wait-btn">Отмена</button>
    `;

    let remaining = 120;
    const timerEl = $('duel-wait-timer');
    clearInterval(window._duelWaitInterval);
    window._duelWaitInterval = setInterval(() => {
        remaining--;
        if (timerEl) {
            const m = Math.floor(remaining / 60);
            const s = String(remaining % 60).padStart(2, '0');
            timerEl.textContent = `${m}:${s}`;
        }
        if (remaining <= 0) {
            clearInterval(window._duelWaitInterval);
        }
    }, 1000);

    content.querySelector('#duel-cancel-wait-btn').onclick = () => {
        clearInterval(window._duelWaitInterval);
        refreshHome();
        showScreen('start-screen');
    };
}

// =============================================
// CHALLENGE ALERT (shown to creator when someone joins)
// =============================================
function showDuelChallengeAlert(data) {
    const { roomId, challengerName, challengerLevel, isBet, betAmount } = data;
    const betText = isBet ? ` (ставка: ${betAmount} монет)` : '';

    // Create a full-screen alert overlay
    let overlay = document.getElementById('duel-challenge-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'duel-challenge-overlay';
        overlay.className = 'duel-challenge-overlay';
        document.body.appendChild(overlay);
    }

    overlay.innerHTML = `
        <div class="duel-challenge-card">
            <div class="duel-challenge-icon">&#9876;</div>
            <div class="duel-challenge-title">Вызов на дуэль!</div>
            <div class="duel-challenge-info">
                <strong>${escapeHtml(challengerName)}</strong> (Ур. ${challengerLevel})${betText}
            </div>
            <div class="duel-challenge-actions">
                <button class="pill-btn primary duel-challenge-accept">&#9876; Сражаться!</button>
                <button class="pill-btn duel-challenge-decline">Отклонить</button>
            </div>
        </div>
    `;
    overlay.style.display = 'flex';

    SFX.correct();
    haptic(30);

    overlay.querySelector('.duel-challenge-accept').onclick = () => {
        overlay.style.display = 'none';
        const socket = connectDuelSocket();
        socket.emit('duel:accept-challenge', { roomId });
    };

    overlay.querySelector('.duel-challenge-decline').onclick = () => {
        overlay.style.display = 'none';
        // Cancel the lobby
        if (duelSocket) {
            duelSocket.emit('duel:cancel-lobby', { roomId, playerId: ensurePlayerId() });
        }
        duelMyLobbyId = null;
    };
}

// =============================================
// BEFOREUNLOAD WARNING (when in active lobby)
// =============================================
function setupDuelBeforeUnload() {
    window.addEventListener('beforeunload', (e) => {
        // If in an active duel, notify server that player is leaving
        if (isDuel && !duelFinished && duelSocket && duelRoomId) {
            duelSocket.emit('duel:leave', { roomId: duelRoomId });
        }
        if (duelMyLobbyId) {
            e.preventDefault();
            e.returnValue = 'У вас открытая дуэль. Если кто-то примет вызов, вам придёт уведомление в Telegram. У вас будет 2 минуты чтобы принять, иначе вы проиграете.';
        }
    });
}
setupDuelBeforeUnload();

// =============================================
// DUEL BUTTON STATE (green when waiting)
// =============================================
function updateDuelButtonState(isWaiting) {
    const btn = $('duel-btn');
    if (!btn) return;
    if (isWaiting) {
        btn.classList.add('duel-waiting');
    } else {
        btn.classList.remove('duel-waiting');
    }
}

// =============================================
// FIND DUEL (legacy quick match — kept for bot fallback)
// =============================================
function startDuelSearch(diff) {
    duelDifficulty = diff || 'hard';
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

    // Deduct bet coins if applicable
    if (duelBetInfo && duelBetInfo.isBet && duelBetInfo.betAmount > 0) {
        save.coins -= duelBetInfo.betAmount;
        writeSave(save);
    }

    // Use the puzzle determined by the server.
    // If the server sent full categories (server-resolved), use them directly
    // to guarantee both players see the exact same puzzle.
    // Fallback: exclude bonus puzzles and resolve by index (for backwards compat).
    const puzzleData = data.puzzle;
    difficulty = puzzleData.difficulty;

    if (puzzleData.categories) {
        // Server sent the actual puzzle — use it directly (guaranteed sync)
        puzzle = { difficulty: puzzleData.difficulty, categories: puzzleData.categories };
        puzzleIndex = puzzleData.puzzleIndex || 0;
    } else {
        // Fallback: resolve locally from daily puzzles pool
        const puzzles = (typeof DAILY_PUZZLES !== 'undefined' && Array.isArray(DAILY_PUZZLES))
            ? DAILY_PUZZLES.filter(p => p.difficulty === difficulty)
            : [];
        const idx = puzzleData.puzzleIndex % puzzles.length;
        puzzleIndex = idx;
        puzzle = puzzles[idx];
    }
    isEndless = false;
    maxMist = DIFF_META[difficulty].attempts;

    initRound();

    // Show opponent indicator
    showDuelOverlay();

    // Start inactivity tracking
    startDuelInactivityTracking();
}

// =============================================
// INACTIVITY TRACKING
// =============================================
function startDuelInactivityTracking() {
    clearDuelInactivityTracking();
    // Send activity pings whenever player interacts
    duelInactivityInterval = setInterval(() => {
        if (isDuel && duelSocket && duelRoomId) {
            duelSocket.emit('duel:activity', { roomId: duelRoomId });
        }
    }, 30000); // Ping every 30s to keep alive
}

function clearDuelInactivityTracking() {
    if (duelInactivityInterval) {
        clearInterval(duelInactivityInterval);
        duelInactivityInterval = null;
    }
}

// Report activity on any game interaction
function reportDuelActivity() {
    if (!isDuel || !duelSocket || !duelRoomId) return;
    duelSocket.emit('duel:activity', { roomId: duelRoomId });
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
    clearDuelInactivityTracking();

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
        <button class="pill-btn" id="duel-cancel-btn">Отмена</button>
    `;

    content.querySelector('#duel-cancel-btn').onclick = () => cancelDuelSearch();

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
    clearInterval(window._duelLobbyInterval);
    clearInterval(window._duelWaitInterval);

    showScreen('duel-search-screen');
    const content = $('duel-search-content');
    if (!content) return;

    const opp = data.opponent;
    const betHtml = data.isBet
        ? `<div class="duel-matched-bet">&#9679; Ставка: ${data.betAmount} монет</div>`
        : '<div class="duel-matched-bet">&#129309; Дружеский матч</div>';

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
        ${betHtml}
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
        showMsg('Соперник решил! Успей за 5 сек!', 'warn');
    }
}

// 5-second countdown after opponent solves
let duelCountdownInterval = null;
function startDuelCountdown(seconds) {
    clearDuelCountdown();
    let remaining = seconds;

    // Show countdown overlay
    let overlay = document.getElementById('duel-countdown-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'duel-countdown-overlay';
        overlay.className = 'duel-countdown-overlay';
        document.getElementById('game-screen').appendChild(overlay);
    }
    overlay.innerHTML = `<div class="duel-countdown-num">${remaining}</div>`;
    overlay.style.display = 'flex';

    duelCountdownInterval = setInterval(() => {
        remaining--;
        if (remaining <= 0) {
            clearDuelCountdown();
            return;
        }
        const numEl = overlay.querySelector('.duel-countdown-num');
        if (numEl) numEl.textContent = remaining;
    }, 1000);
}

function clearDuelCountdown() {
    if (duelCountdownInterval) {
        clearInterval(duelCountdownInterval);
        duelCountdownInterval = null;
    }
    const overlay = document.getElementById('duel-countdown-overlay');
    if (overlay) overlay.style.display = 'none';
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
    }

    // Handle bet payouts
    if (data.isBet && data.betAmount > 0) {
        if (iWon && !isDraw) {
            // Winner gets both bets
            save.coins += data.betAmount * 2;
        } else if (isDraw) {
            // Draw — refund bet
            save.coins += data.betAmount;
        }
        // Loser already had coins deducted at game start
    }

    writeSave(save);

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
                ${data.isBet ? `<div class="duel-result-bet">&#9679; Ставка возвращена: ${data.betAmount} монет</div>` : ''}
            </div>`;
    } else {
        const betResultHtml = data.isBet
            ? `<div class="duel-result-bet">${iWon ? '&#9679; Выигрыш: +' + data.betAmount * 2 + ' монет' : '&#9679; Потеряно: ' + data.betAmount + ' монет'}</div>`
            : '';
        html = `
            <div class="duel-result-card ${iWon ? 'win' : 'lose'}">
                <div class="duel-result-icon">${iWon ? '&#127942;' : '&#128546;'}</div>
                <div class="duel-result-title">${iWon ? 'Вы победили!' : 'Вы проиграли'}</div>
                ${betResultHtml}
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
    duelBetInfo = null;
}

// Explicitly leave a duel (back button, menu, app close)
function leaveDuel() {
    if (!isDuel || !duelSocket || !duelRoomId) return;
    duelSocket.emit('duel:leave', { roomId: duelRoomId });
    clearDuelInactivityTracking();
    clearDuelCountdown();
    hideDuelOverlay();
    isDuel = false;
    duelFinished = true;
    duelBetInfo = null;
}

// Handle app visibility change — if player hides the app during duel, leave
function setupDuelVisibilityHandler() {
    document.addEventListener('visibilitychange', () => {
        if (document.hidden && isDuel && !duelFinished) {
            leaveDuel();
        }
    });
}
setupDuelVisibilityHandler();

function formatDuelTime(seconds) {
    if (!seconds || seconds >= 999) return '--:--';
    const m = Math.floor(seconds / 60);
    const s = String(seconds % 60).padStart(2, '0');
    return `${m}:${s}`;
}

// =============================================
// URL PARAMS — handle duel_room deep link
// =============================================
function handleDuelUrlParams() {
    const params = new URLSearchParams(window.location.search);
    const duelRoom = params.get('duel_room');
    if (duelRoom) {
        // Clean the URL
        const url = new URL(window.location);
        url.searchParams.delete('duel_room');
        window.history.replaceState({}, '', url);

        // Connect and accept the challenge
        setTimeout(() => {
            const socket = connectDuelSocket();
            socket.emit('duel:accept-challenge', { roomId: duelRoom });
        }, 500);
    }
}

// =============================================
// DUEL PICK SCREEN (now shows lobby)
// =============================================
function showDuelDiffPicker() {
    showDuelLobby();
}
