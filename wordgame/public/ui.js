/**
 * ui.js — Screen management, rendering, animations, effects
 *
 * Depends on: save.js, audio.js, game.js, words.js
 */

// =============================================
// DOM HELPERS
// =============================================
const $ = id => document.getElementById(id);

const SCREEN_IDS = ['start-screen', 'game-screen', 'result-screen', 'profile-screen', 'archive-screen', 'lb-screen', 'duel-pick-screen', 'duel-search-screen'];

function showScreen(id) {
    SCREEN_IDS.forEach(sid => $(sid).classList.remove('active'));
    $(id).classList.add('active');
    $(id).scrollTop = 0;

    // Track current screen for Telegram BackButton
    if (typeof _currentScreen !== 'undefined') {
        _currentScreen = id;
    }
    if (typeof tgUpdateBackButton === 'function') {
        tgUpdateBackButton();
    }
}

// =============================================
// MESSAGE BAR
// =============================================
let msgTimeout = null;

function showMsg(text, type = 'error') {
    clearTimeout(msgTimeout);
    const el = $('msg');
    el.textContent = text;
    el.className = 'msg ' + type + ' show';
    msgTimeout = setTimeout(hideMsg, 2500);
}

function hideMsg() {
    clearTimeout(msgTimeout);
    $('msg').classList.remove('show');
}

// =============================================
// HOME SCREEN
// =============================================
function refreshHome() {
    // Sync bonus puzzles with save state before counting
    syncBonusWords();

    $('home-coins-val').textContent = save.coins;
    $('home-lvl-label').textContent = `Уровень ${save.level}`;
    const need = xpForLevel(save.level);
    $('home-xp-label').textContent = `${save.xp} / ${need} XP`;
    $('home-xp-fill').style.width = Math.min(100, (save.xp / need) * 100) + '%';

    renderHomeWeekly();
    renderBonusWordsButton();

    const grid = $('diff-grid');
    grid.innerHTML = '';
    for (const [key, meta] of Object.entries(DIFF_META)) {
        const puzzles = WORD_PUZZLES.filter(p => p.difficulty === key);
        if (!puzzles.length) continue;
        const completed = puzzles.filter((_, i) => save.completedPuzzles[`${key}_${i}`] !== undefined).length;
        let starHtml = '';
        puzzles.forEach((_, i) => {
            const s = save.completedPuzzles[`${key}_${i}`];
            if (s !== undefined) {
                starHtml += `<span class="puzzle-star puzzle-star-${s}">&#9733;</span>`;
            }
        });
        const starDisplay = starHtml || '—';

        const btn = document.createElement('button');
        btn.className = 'diff-btn';
        btn.innerHTML = `
            <span class="diff-left"><span class="diff-dot ${key}"></span>${meta.label}</span>
            <span class="diff-info">
                <span class="diff-stars">${starDisplay}</span>
                <span class="diff-attempts">${completed}/${puzzles.length}</span>
            </span>`;
        btn.onclick = () => launchGame(key);
        grid.appendChild(btn);
    }
}

// =============================================
// GAME SCREEN SETUP
// =============================================
function setupGameScreen() {
    const meta = DIFF_META[difficulty];
    $('game-badge').textContent = meta.short;
    $('game-badge').className = 'badge ' + meta.color;
    $('game-coins-val').textContent = save.coins;
    $('hint-explain-cost').innerHTML = `${HINT_REVEAL_COST} &#9679;`;
    $('hint-remove-cost').innerHTML = `${HINT_REMOVE_COST} &#9679;`;

    showScreen('game-screen');
    renderMistakes();
    renderBoard(true);
    updateBtns();
}

// =============================================
// CARD FONTS (random per round)
// =============================================
const CARD_FONTS = ['', 'font-unbounded', 'font-nunito', 'font-comfortaa'];
let _cardFontMap = {};

function assignCardFonts(words) {
    _cardFontMap = {};
    words.forEach(item => {
        _cardFontMap[item.word] = CARD_FONTS[Math.floor(Math.random() * CARD_FONTS.length)];
    });
}

// =============================================
// FONT SCALING (fit word inside card)
// =============================================
function calcCardFontSize(word) {
    const len = word.length;
    if (len <= 4)  return 13;
    if (len <= 6)  return 12;
    if (len <= 8)  return 11;
    if (len <= 10) return 9.5;
    if (len <= 13) return 8;
    return 7;
}

// =============================================
// WORD HYPHENATION (split long words for tiles)
// =============================================
const MAX_WORD_DISPLAY_LEN = 12;

function hyphenateWord(word) {
    // Don't hyphenate short words or words with spaces (multi-word entries)
    if (word.length <= MAX_WORD_DISPLAY_LEN || word.includes(' ')) return word;

    // Split at roughly the midpoint, preferring to break after a vowel
    const vowels = 'АЕЁИОУЫЭЮЯаеёиоуыэюя';
    const mid = Math.ceil(word.length / 2);
    let breakAt = mid;

    // Search for a vowel near the midpoint to break after
    for (let offset = 0; offset <= 3; offset++) {
        if (mid + offset < word.length && vowels.includes(word[mid + offset])) {
            breakAt = mid + offset + 1;
            break;
        }
        if (mid - offset > 1 && vowels.includes(word[mid - offset])) {
            breakAt = mid - offset + 1;
            break;
        }
    }

    return word.slice(0, breakAt) + '-\n' + word.slice(breakAt);
}

// =============================================
// BOARD RENDERING
// =============================================
function renderBoard(animate = false) {
    // Solved categories
    const sa = $('solved-area');
    sa.innerHTML = '';
    solvedCats.forEach(cat => {
        const row = document.createElement('div');
        row.className = 'solved-row';
        row.style.backgroundColor = cat.color;
        row.innerHTML = `<div class="solved-theme">${cat.theme}</div><div class="solved-words">${cat.words.join(', ')}</div>`;
        sa.appendChild(row);
    });

    // Assign random fonts once per round (keep stable during re-renders)
    if (!Object.keys(_cardFontMap).length && activeWords.length) {
        assignCardFonts(activeWords);
    }

    // Active words grid
    const g = $('grid');
    g.innerHTML = '';
    activeWords.forEach((item, i) => {
        const card = document.createElement('div');
        card.className = 'card';
        // Random font class
        const fontClass = _cardFontMap[item.word] || '';
        if (fontClass) card.classList.add(fontClass);
        // Font scaling based on word length
        card.style.fontSize = calcCardFontSize(item.word) + 'px';

        if (selected.includes(item)) card.classList.add('selected');
        if (explainMode) card.classList.add('explain-target');
        if (removeMode) card.classList.add('remove-target');
        if (animate) {
            card.classList.add('pop-in');
            card.style.animationDelay = `${i * 25}ms`;
        }
        const displayWord = hyphenateWord(item.word);
        if (displayWord.includes('\n')) {
            // Multi-line: use innerHTML with <br> for line break
            card.innerHTML = displayWord.replace('\n', '<br>');
            card.style.lineHeight = '1.1';
        } else {
            card.textContent = displayWord;
        }
        card.dataset.idx = i;
        card.onclick = () => toggleSelect(item);
        g.appendChild(card);
    });
}

function renderMistakes() {
    const row = $('mistakes-row');
    row.innerHTML = '<span class="mistakes-label">Попытки: </span>';
    for (let i = 0; i < maxMist; i++) {
        const d = document.createElement('span');
        d.className = 'mdot' + (i < mistakesMade ? ' lost' : '');
        row.appendChild(d);
    }
}

function updateBtns() {
    $('deselect-btn').disabled = selected.length === 0 || gameOver;
    $('submit-btn').disabled = selected.length !== 4 || gameOver;
    $('shuffle-btn').disabled = gameOver;
    $('hint-explain').disabled = gameOver || save.coins < HINT_REVEAL_COST || activeWords.length === 0;
    $('hint-remove').disabled = gameOver || save.coins < HINT_REMOVE_COST || activeWords.length <= 4;
    $('game-coins-val').textContent = save.coins;

    // Visual feedback for explain mode
    const explainBtn = $('hint-explain');
    if (explainMode) {
        explainBtn.classList.add('hint-active');
    } else {
        explainBtn.classList.remove('hint-active');
    }

    // Visual feedback for remove mode
    const removeBtn = $('hint-remove');
    if (removeMode) {
        removeBtn.classList.add('hint-active');
    } else {
        removeBtn.classList.remove('hint-active');
    }
}

// =============================================
// HINT ANIMATIONS
// =============================================
function highlightHintCard(idx) {
    const cards = $('grid').querySelectorAll('.card');
    if (cards[idx]) {
        cards[idx].classList.add('hint-glow');
    }
}

function showExplainPopup(word, meaning) {
    // Remove any existing popup
    const existing = document.querySelector('.explain-popup');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.className = 'explain-popup';
    overlay.innerHTML = `
        <div class="explain-popup-content">
            <div class="explain-popup-word">${word}</div>
            <div class="explain-popup-meaning">${meaning}</div>
            <button class="explain-popup-close">Понятно</button>
        </div>`;
    overlay.querySelector('.explain-popup-close').onclick = () => overlay.remove();
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
    document.body.appendChild(overlay);
}

function animateHintRemove(idx, callback) {
    const cards = $('grid').querySelectorAll('.card');
    if (cards[idx]) {
        cards[idx].classList.add('hint-remove');
        setTimeout(callback, 400);
    } else {
        callback();
    }
}

// =============================================
// LOCKED CATEGORY (loss) — pay coins to reveal
// =============================================
function renderBoardWithLockedCategory(lockedCat) {
    const sa = $('solved-area');
    sa.innerHTML = '';

    // Render already solved categories
    solvedCats.forEach(cat => {
        const row = document.createElement('div');
        row.className = 'solved-row';
        row.style.backgroundColor = cat.color;
        row.innerHTML = `<div class="solved-theme">${cat.theme}</div><div class="solved-words">${cat.words.join(', ')}</div>`;
        sa.appendChild(row);
    });

    // Render locked category
    const lockedRow = document.createElement('div');
    lockedRow.className = 'solved-row locked-category';
    lockedRow.innerHTML = `
        <div class="locked-category-icon">&#128274;</div>
        <div class="locked-category-text">Показать категорию</div>
        <div class="locked-category-cost">${typeof REVEAL_CATEGORY_COST !== 'undefined' ? REVEAL_CATEGORY_COST : 15} &#9679;</div>`;
    lockedRow.onclick = () => {
        if (typeof revealLockedCategory === 'function') revealLockedCategory();
    };
    sa.appendChild(lockedRow);

    // Clear grid
    $('grid').innerHTML = '';
}

// =============================================
// "ДАЛЕЕ" BUTTON (replaces auto-advance)
// =============================================
function showNextButton(callback) {
    hideNextButton();
    const btn = document.createElement('button');
    btn.id = 'next-btn';
    btn.className = 'pill-btn primary next-btn';
    btn.textContent = 'Далее';
    btn.onclick = callback;
    document.querySelector('#game-screen .bottom-area').appendChild(btn);
}

function hideNextButton() {
    const el = document.getElementById('next-btn');
    if (el) el.remove();
}

// =============================================
// GAME ANIMATIONS
// =============================================
function shakeSelected() {
    const cards = $('grid').querySelectorAll('.card.selected');
    cards.forEach(card => {
        card.classList.remove('shake');
        void card.offsetWidth;
        card.classList.add('shake');
    });
}

function animateMistakeLoss() {
    const dots = $('mistakes-row').querySelectorAll('.mdot');
    const target = dots[mistakesMade - 1];
    if (target) {
        target.classList.add('pop');
        target.addEventListener('animationend', () => {
            target.classList.remove('pop');
            target.classList.add('lost');
        }, { once: true });
    }
}

function showCombo(n) {
    const el = $('combo-overlay');
    el.innerHTML = n === 4 ? 'PERFECT!' : `COMBO x${n}!`;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
}

// =============================================
// RESULT SCREEN
// =============================================
function showResultScreen(won, stars, xpGain, coinsGain, elapsed, leveledUp, newLevel, newAchs, dailyResult, puzzleProgress, difficultyCompleted) {
    $('res-icon').textContent = won ? '🎉' : '😔';
    $('res-title').textContent = won ? 'Победа!' : 'Не повезло';

    // Show puzzle progress (X/N) for wins
    if (won && puzzleProgress) {
        $('res-sub').innerHTML = `Все связи найдены!<br><span class="res-progress">${DIFF_META[difficulty].label}: ${puzzleProgress.current}/${puzzleProgress.total}</span>`;
    } else {
        $('res-sub').textContent = won ? 'Все связи найдены!' : 'Попробуй ещё раз!';
    }

    // Stars
    const starsEl = $('res-stars');
    starsEl.innerHTML = '';
    if (won) {
        for (let i = 0; i < 3; i++) {
            const s = document.createElement('span');
            s.className = 'star' + (i < stars ? ' earned' : '');
            s.textContent = '⭐';
            if (i < stars) s.style.animationDelay = `${i * 0.15}s`;
            starsEl.appendChild(s);
        }
    }

    // Stats
    const minutes = Math.floor(elapsed / 60);
    const secs = String(elapsed % 60).padStart(2, '0');
    $('res-stats').innerHTML = `
        <div class="stat"><div class="stat-num">${maxMist - mistakesMade}/${maxMist}</div><div class="stat-label">Попытки</div></div>
        <div class="stat"><div class="stat-num">${minutes}:${secs}</div><div class="stat-label">Время</div></div>
        <div class="stat"><div class="stat-num coins">+${coinsGain}</div><div class="stat-label">Монеты</div></div>
    `;

    // Streak bonus info
    const streakEl = $('res-streak');
    streakEl.innerHTML = '';
    if (dailyResult && dailyResult.streakDays > 0) {
        const bonusLabel = dailyResult.streakBonus > 0
            ? `<span class="streak-result-bonus">+${Math.round(dailyResult.streakBonus * 100)}% к монетам</span>`
            : '';
        streakEl.innerHTML = `<div class="streak-result">
            <span class="streak-result-fire">&#128293;</span>
            <span class="streak-result-text">${dailyResult.streakDays} ${pluralDays(dailyResult.streakDays)} подряд</span>
            ${bonusLabel}
        </div>`;
    }

    // XP bar
    $('res-xp-val').textContent = `+${xpGain} XP`;

    // Level up banner
    const lvlEl = $('res-lvlup');
    lvlEl.innerHTML = '';
    if (leveledUp) {
        lvlEl.innerHTML = `<div class="lvlup-banner"><div class="lvlup-txt">Новый уровень!</div><div class="lvlup-num">${newLevel}</div></div>`;
        SFX.levelUp();
    }

    // Achievement unlocks
    const achEl = $('res-achievements');
    achEl.innerHTML = '';
    newAchs.forEach(id => {
        const a = ACHIEVEMENTS.find(ach => ach.id === id);
        if (!a) return;
        achEl.innerHTML += `
            <div class="ach-unlock">
                <span class="ach-unlock-icon">${a.icon}</span>
                <div class="ach-unlock-text">
                    <div class="ach-unlock-name">${a.name}</div>
                    <div class="ach-unlock-desc">${a.desc}</div>
                </div>
            </div>`;
        SFX.ach();
    });

    // Daily challenge completions
    const dailyEl = $('res-daily');
    dailyEl.innerHTML = '';
    if (dailyResult && dailyResult.completedChallenges.length > 0) {
        dailyResult.completedChallenges.forEach(ch => {
            dailyEl.innerHTML += `
                <div class="daily-unlock">
                    <span class="daily-unlock-icon">${ch.icon}</span>
                    <div class="daily-unlock-text">
                        <div class="daily-unlock-name">${ch.name}</div>
                        <div class="daily-unlock-desc">+${ch.reward} &#9679;</div>
                    </div>
                </div>`;
        });
        SFX.coin();
    }

    // Weekly challenge completion
    if (dailyResult && dailyResult.weeklyDone) {
        dailyEl.innerHTML += `
            <div class="daily-unlock weekly">
                <span class="daily-unlock-icon">&#127942;</span>
                <div class="daily-unlock-text">
                    <div class="daily-unlock-name">Еженедельный челлендж!</div>
                    <div class="daily-unlock-desc">Заберите награду в меню</div>
                </div>
            </div>`;
    }

    // Weekly speed rank (shown after weekly puzzle win)
    if (won && save.weeklySpeedRank && save.weeklySpeedWeekId === (typeof getWeekId === 'function' ? getWeekId() : '')) {
        const speedTime = save.weeklySpeedTime || 0;
        const speedMin = Math.floor(speedTime / 60);
        const speedSec = String(speedTime % 60).padStart(2, '0');
        const rankMedal = save.weeklySpeedRank === 1 ? '&#129351;' : save.weeklySpeedRank === 2 ? '&#129352;' : save.weeklySpeedRank === 3 ? '&#129353;' : '';
        const rankDisplay = rankMedal || save.weeklySpeedRank;
        dailyEl.innerHTML += `
            <div class="daily-unlock weekly-speed">
                <span class="daily-unlock-icon">&#9889;</span>
                <div class="daily-unlock-text">
                    <div class="daily-unlock-name">Скорость: ${speedMin}:${speedSec}</div>
                    <div class="daily-unlock-desc">${rankDisplay} место из ${save.weeklySpeedTotal} игроков</div>
                </div>
            </div>`;
    }

    // Clear duel result (filled by duel.js if in duel mode)
    const resDuel = $('res-duel');
    if (resDuel) resDuel.innerHTML = '';

    // Difficulty completion congratulations
    const diffCompleteEl = $('res-diff-complete');
    if (diffCompleteEl) diffCompleteEl.innerHTML = '';
    if (won && difficultyCompleted && diffCompleteEl) {
        const meta = DIFF_META[difficulty];
        diffCompleteEl.innerHTML = `
            <div class="diff-complete-banner">
                <div class="diff-complete-icon">&#127881;</div>
                <div class="diff-complete-title">Поздравляем!</div>
                <div class="diff-complete-desc">Ты прошёл все паззлы уровня «${meta.label}»!</div>
            </div>`;
    }

    // Action buttons
    const actEl = $('res-actions');
    actEl.innerHTML = '';
    function addActionBtn(label, callback, primary = true) {
        const btn = document.createElement('button');
        btn.className = primary ? 'pill-btn primary' : 'pill-btn';
        btn.textContent = label;
        btn.onclick = callback;
        actEl.appendChild(btn);
    }
    if (typeof isDuel !== 'undefined' && isDuel) {
        addActionBtn('Ещё дуэль', () => showDuelDiffPicker());
    } else if (isEndless) {
        addActionBtn('Следующий раунд', () => launchEndless());
    } else if (won && difficultyCompleted) {
        // All puzzles of this difficulty completed — only show menu button
        addActionBtn('В меню', () => { refreshHome(); showScreen('start-screen'); });
    } else {
        addActionBtn('Играть ещё', () => launchGame(difficulty));
        addActionBtn('В меню', () => { refreshHome(); showScreen('start-screen'); }, false);
    }

    showScreen('result-screen');

    if (won) {
        SFX.win();
        launchConfetti();
    } else {
        SFX.lose();
    }
}

// =============================================
// PROFILE SCREEN
// =============================================
function refreshProfile() {
    $('p-level').textContent = save.level;
    $('p-lvl-label').textContent = `Уровень ${save.level}`;
    const need = xpForLevel(save.level);
    $('p-xp-label').textContent = `${save.xp} / ${need} XP`;
    $('p-xp-fill').style.width = Math.min(100, (save.xp / need) * 100) + '%';
    $('p-coins').textContent = save.coins;
    $('p-name').textContent = save.playerName || 'Игрок';

    const winRate = save.totalGames > 0 ? Math.round((save.totalWins / save.totalGames) * 100) : 0;
    $('p-stats-grid').innerHTML = `
        <div class="pstat"><div class="pstat-num">${save.totalGames}</div><div class="pstat-label">Игр</div></div>
        <div class="pstat"><div class="pstat-num">${winRate}%</div><div class="pstat-label">Побед</div></div>
        <div class="pstat"><div class="pstat-num">${save.bestStreak}</div><div class="pstat-label">Лучший стрик</div></div>
        <div class="pstat"><div class="pstat-num">${save.perfectGames}</div><div class="pstat-label">Безупречных</div></div>
        <div class="pstat"><div class="pstat-num">${save.dailyStreak || 0}</div><div class="pstat-label">Дейли-стрик</div></div>
        <div class="pstat"><div class="pstat-num">${save.duelWins || 0}</div><div class="pstat-label">Побед дуэлей</div></div>
    `;

    // Daily panel
    renderDailyPanel();

    // Achievement list
    const achList = $('ach-list');
    achList.innerHTML = '';
    ACHIEVEMENTS.forEach(a => {
        const unlocked = hasAch(save, a.id);
        achList.innerHTML += `
            <div class="ach-item${unlocked ? '' : ' locked'}">
                <span class="ach-icon">${a.icon}</span>
                <div class="ach-info"><div class="ach-name">${a.name}</div><div class="ach-desc">${a.desc}</div></div>
                ${unlocked ? '<span class="ach-check">&#10003;</span>' : ''}
            </div>`;
    });
}

// =============================================
// ARCHIVE SCREEN
// =============================================
function refreshArchive() {
    const content = $('archive-content');
    content.innerHTML = '';

    for (const [key, meta] of Object.entries(DIFF_META)) {
        const puzzles = WORD_PUZZLES.filter(p => p.difficulty === key);
        if (!puzzles.length) continue;

        const section = document.createElement('div');
        section.className = 'archive-diff-section';
        section.innerHTML = `<div class="archive-diff-title"><span class="diff-dot ${key}"></span>${meta.label} (${puzzles.length})</div>`;

        const grid = document.createElement('div');
        grid.className = 'archive-grid';

        puzzles.forEach((_, i) => {
            const saveKey = `${key}_${i}`;
            const starCount = save.completedPuzzles[saveKey] || 0;
            const completed = save.completedPuzzles[saveKey] !== undefined;
            const tile = document.createElement('button');
            tile.className = 'archive-tile' + (completed ? ' completed' : '');
            tile.innerHTML = `<span>${i + 1}</span><span class="tile-stars">${'⭐'.repeat(starCount)}${'☆'.repeat(3 - starCount)}</span>`;
            tile.onclick = () => launchGame(key, i);
            grid.appendChild(tile);
        });

        section.appendChild(grid);
        content.appendChild(section);
    }
}

// =============================================
// CONFETTI
// =============================================
function launchConfetti() {
    const c = $('confetti-container');
    c.innerHTML = '';
    const colors = ['#7c6af6', '#f9df6d', '#a0c35a', '#f87171', '#c084fc', '#34d399', '#fbbf24'];
    for (let i = 0; i < 80; i++) {
        const p = document.createElement('div');
        p.className = 'confetti';
        p.style.left = Math.random() * 100 + '%';
        p.style.background = colors[Math.floor(Math.random() * colors.length)];
        p.style.animationDuration = (1.5 + Math.random() * 2) + 's';
        p.style.animationDelay = (Math.random() * 0.8) + 's';
        p.style.width = (5 + Math.random() * 6) + 'px';
        p.style.height = (5 + Math.random() * 6) + 'px';
        c.appendChild(p);
    }
    setTimeout(() => { c.innerHTML = ''; }, 4000);
}

// =============================================
// TOASTS
// =============================================
function showToast(icon, text) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.innerHTML = `<span class="toast-icon">${icon}</span><span class="toast-text">${text}</span>`;
    $('toast-container').appendChild(t);
    setTimeout(() => t.remove(), 3000);
}

// =============================================
// BONUS WORDS SYNC (unlock only via Telegram bot)
// =============================================

/**
 * Sync WORD_PUZZLES with bonus unlock state.
 * If unlocked  → ensure bonus puzzles are appended.
 * If not unlocked → ensure bonus puzzles are removed.
 */
function syncBonusWords() {
    if (save.bonusWordsUnlocked) {
        if (typeof appendBonusWords === 'function') appendBonusWords();
    } else {
        if (typeof removeBonusWords === 'function') removeBonusWords();
    }
}

function renderBonusWordsButton() {
    const el = $('bonus-words-section');
    if (!el) return;
    // Button removed from webapp — unlock only via Telegram bot menu
    el.innerHTML = '';
}

// =============================================
// EVENT LISTENERS
// =============================================
function initEventListeners() {
    // Home
    $('endless-btn').onclick = () => launchEndless();
    $('profile-btn').onclick = () => { refreshProfile(); showScreen('profile-screen'); };

    // Game
    $('shuffle-btn').onclick = () => { returnRemovedWords(); shuffleArray(activeWords); renderBoard(true); SFX.select(); haptic(5); updateBtns(); };
    $('deselect-btn').onclick = () => { selected = []; returnRemovedWords(); renderBoard(); updateBtns(); };
    $('submit-btn').onclick = checkSubmission;
    $('game-back').onclick = () => {
        stopTimer();
        // Cleanup win review if active
        if (typeof cleanupWinReview === 'function') cleanupWinReview();
        if (typeof isDuel !== 'undefined' && isDuel) {
            isDuel = false;
            if (typeof hideDuelOverlay === 'function') hideDuelOverlay();
        }
        if (typeof isWeeklyPuzzleMode !== 'undefined') isWeeklyPuzzleMode = false;
        refreshHome();
        showScreen('start-screen');
    };
    $('hint-explain').onclick = useHintExplain;
    $('hint-remove').onclick = useHintRemove;

    // Profile
    $('profile-back').onclick = () => { refreshHome(); showScreen('start-screen'); };
    $('archive-btn').onclick = () => { refreshArchive(); showScreen('archive-screen'); };
    $('reset-btn').onclick = () => {
        if (confirm('Точно сбросить весь прогресс? Это действие нельзя отменить.')) {
            save = resetSave();
            noHintWins = 0;
            refreshProfile();
            showToast('&#128465;', 'Прогресс сброшен');
        }
    };

    // Archive
    $('archive-back').onclick = () => { refreshProfile(); showScreen('profile-screen'); };

    // Result screen
    $('share-img-btn').onclick = () => shareResultImage();

    // Leaderboard
    $('lb-btn').onclick = () => { refreshLeaderboard(); showScreen('lb-screen'); };
    $('lb-back').onclick = () => { refreshHome(); showScreen('start-screen'); };
    $('share-lb-btn').onclick = () => shareLeaderboardPosition();
    document.querySelectorAll('#lb-tabs .lb-tab').forEach(tab => {
        tab.onclick = () => refreshLeaderboard(tab.dataset.sort);
    });

    // Duel
    $('duel-btn').onclick = () => showDuelDiffPicker();
    $('duel-pick-back').onclick = () => { refreshHome(); showScreen('start-screen'); };
}

// (Daily/Weekly puzzle buttons removed)

// =============================================
// URL PARAMS (Telegram Mini App deep links)
// =============================================
function handleUrlParams() {
    const params = new URLSearchParams(window.location.search);

    // Bonus unlock is now handled early in initApp()
    // (before async verify/puzzle-loader to avoid race conditions)

    const mode = params.get('mode');
    if (mode === 'weekly' && typeof launchWeeklyPuzzle === 'function') {
        launchWeeklyPuzzle();
    }
}

// =============================================
// INIT
// =============================================
function initApp() {
    // Initialize Telegram WebApp features (fullscreen, haptics, back button)
    if (typeof initTelegram === 'function') {
        initTelegram();
    }

    // ===== Handle bonus words unlock FIRST (before async verify/loader) =====
    let bonusJustUnlocked = false;

    // Check Telegram startapp parameter (deep link from bot)
    if (typeof TG !== 'undefined' && TG && TG.initDataUnsafe && TG.initDataUnsafe.start_param === 'unlock_bonus') {
        if (typeof unlockBonusWords === 'function') {
            bonusJustUnlocked = unlockBonusWords();
        }
    }

    // Check URL params (webapp opened with ?unlock_bonus=1)
    const _urlParams = new URLSearchParams(window.location.search);
    if (_urlParams.get('unlock_bonus') === '1' && typeof unlockBonusWords === 'function') {
        const wasNew = unlockBonusWords();
        bonusJustUnlocked = bonusJustUnlocked || wasNew;
    }

    // Sync bonus words: append if unlocked, remove stale ones if not
    syncBonusWords();

    checkDailyReset();
    initEventListeners();
    refreshHome();

    // Show toast for new bonus unlock
    if (bonusJustUnlocked) {
        const count = typeof BONUS_WORD_PUZZLES !== 'undefined' ? BONUS_WORD_PUZZLES.length : 0;
        showToast('🎁', `Добавлено ${count} бонусных паззлов!`);
        if (typeof SFX !== 'undefined') SFX.ach();
        haptic(20);
    }

    // Verify bonus words unlock with server (async)
    // Skip if just unlocked to avoid race condition
    if (!bonusJustUnlocked && typeof verifyBonusUnlockFromServer === 'function') {
        verifyBonusUnlockFromServer().then(verified => {
            syncBonusWords();
            refreshHome();
        });
    }

    // Load fresh puzzles from GitHub, then refresh UI
    if (typeof initPuzzleLoader === 'function') {
        initPuzzleLoader().then(() => {
            refreshHome();
            handleUrlParams();
        });
    } else {
        handleUrlParams();
    }
}

// Run on load
initApp();
