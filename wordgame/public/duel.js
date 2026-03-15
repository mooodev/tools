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

// =============================================
// SOCKET CONNECTION
// =============================================
function connectDuelSocket() {
    if (duelSocket && duelSocket.connected) return duelSocket;

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
    });

    duelSocket.on('duel:opponent-disconnected', () => {
        showToast('&#128683;', 'Соперник отключился');
    });

    duelSocket.on('duel:result', (data) => {
        duelResult = data;
        showDuelResult(data);
    });

    duelSocket.on('duel:lobby-created', (data) => {
        duelMyLobbyId = data.roomId;
        updateDuelButtonState(true);
        renderDuelLobbyWaiting(data.roomId);
    });

    duelSocket.on('duel:lobbies-updated', (lobbies) => {
        renderDuelLobbiesList(lobbies);
    });

    duelSocket.on('duel:lobby-expired', (data) => {
        if (duelMyLobbyId === data.roomId) {
            duelMyLobbyId = null;
            updateDuelButtonState(false);
            showToast('&#9201;', 'Время ожидания истекло');
            showDuelLobby();
        }
    });

    duelSocket.on('duel:lobby-error', (data) => {
        showToast('&#128683;', data.error || 'Ошибка');
    });

    duelSocket.on('disconnect', () => {
        console.log('Duel socket disconnected');
        duelMyLobbyId = null;
        updateDuelButtonState(false);
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

    container.innerHTML = `
        <div class="duel-lobby-rules">
            <span class="duel-lobby-rules-icon">&#9432;</span>
            Если вы не в приложении, у вас будет 2 минуты чтобы принять вызов.
        </div>
        <button class="pill-btn primary duel-create-btn" id="duel-create-btn">&#9876; Создать дуэль</button>
        <div class="duel-lobby-title">Открытые дуэли</div>
        <div class="duel-lobbies-list" id="duel-lobbies-list">
            <div class="duel-lobbies-empty">Загрузка...</div>
        </div>
    `;

    container.querySelector('#duel-create-btn').onclick = () => showCreateDuelDialog();
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

    socket.emit('duel:create-lobby', {
        playerId: ensurePlayerId(),
        playerName: getPlayerName(),
        playerLevel: save.level,
        difficulty: duelDifficulty,
        isBet,
        betAmount: isBet ? betAmount : 0
    });
}

function renderDuelLobbyWaiting(roomId) {
    const container = $('duel-lobby-container');
    if (!container) return;

    container.innerHTML = `
        <div class="duel-search-anim">
            <div class="duel-search-ring"></div>
            <div class="duel-search-icon">&#9876;</div>
        </div>
        <div class="duel-search-title">Ожидание соперника...</div>
        <div class="duel-search-sub">Другой игрок увидит вашу дуэль в списке.<br>Время ожидания: 2 минуты.</div>
        <div class="duel-search-timer" id="duel-lobby-timer">2:00</div>
        <button class="pill-btn" id="duel-cancel-lobby-btn">Отмена</button>
    `;

    // Countdown 2 minutes
    let remaining = 120;
    const timerEl = $('duel-lobby-timer');
    clearInterval(window._duelLobbyInterval);
    window._duelLobbyInterval = setInterval(() => {
        remaining--;
        if (timerEl) {
            const m = Math.floor(remaining / 60);
            const s = String(remaining % 60).padStart(2, '0');
            timerEl.textContent = `${m}:${s}`;
        }
        if (remaining <= 0) {
            clearInterval(window._duelLobbyInterval);
        }
    }, 1000);

    container.querySelector('#duel-cancel-lobby-btn').onclick = () => {
        clearInterval(window._duelLobbyInterval);
        if (duelSocket && duelMyLobbyId) {
            duelSocket.emit('duel:cancel-lobby', { roomId: duelMyLobbyId });
        }
        duelMyLobbyId = null;
        updateDuelButtonState(false);
        showDuelLobby();
    };
}

function renderDuelLobbiesList(lobbies) {
    const list = $('duel-lobbies-list');
    if (!list) return;

    const myId = ensurePlayerId();
    // Filter out my own lobby
    const otherLobbies = lobbies.filter(l => l.creatorName && l.creatorName !== getPlayerName());

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
                <button class="pill-btn primary duel-join-btn">Принять</button>
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

    // Show search screen while waiting for match confirmation
    showScreen('duel-search-screen');
    const content = $('duel-search-content');
    if (content) {
        content.innerHTML = `
            <div class="duel-search-anim">
                <div class="duel-search-ring"></div>
                <div class="duel-search-icon">&#9876;</div>
            </div>
            <div class="duel-search-title">Подключение...</div>
        `;
    }
}

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

function formatDuelTime(seconds) {
    if (!seconds || seconds >= 999) return '--:--';
    const m = Math.floor(seconds / 60);
    const s = String(seconds % 60).padStart(2, '0');
    return `${m}:${s}`;
}

// =============================================
// DUEL PICK SCREEN (now shows lobby)
// =============================================
function showDuelDiffPicker() {
    showDuelLobby();
}
