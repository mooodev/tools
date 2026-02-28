/**
 * daily.js — Daily streak, daily challenges, weekly challenge
 *
 * Depends on: save.js, audio.js
 * Used by: game.js, ui.js
 */

// =============================================
// CONSTANTS
// =============================================
const DAILY_BONUS_ALL = 50;
const WEEKLY_COIN_REWARD = 100;
const WEEKLY_XP_REWARD = 300;

const DAILY_CHALLENGE_POOL = [
    { id: 'no_mistakes', icon: '&#11088;',  name: 'Безупречно',         desc: 'Выиграй без ошибок',               reward: 30, target: 1 },
    { id: 'speed_90',    icon: '&#9889;',   name: 'Молния',             desc: 'Выиграй за 90 секунд',              reward: 25, target: 1 },
    { id: 'no_hints',    icon: '&#129504;',  name: 'Своим умом',         desc: 'Выиграй без подсказок',             reward: 20, target: 1 },
    { id: 'play_3',      icon: '&#127922;', name: 'Активный игрок',     desc: 'Сыграй 3 раунда',                   reward: 20, target: 3 },
    { id: 'win_2',       icon: '&#127942;', name: 'Двойная победа',     desc: 'Выиграй 2 раунда',                  reward: 25, target: 2 },
    { id: 'combo_3',     icon: '&#128165;', name: 'Комбо-мастер',       desc: 'Набери комбо x3 или выше',          reward: 30, target: 1 },
    { id: 'hard_win',    icon: '&#128170;', name: 'Вызов принят',       desc: 'Выиграй на Трудном или Эксперте',   reward: 35, target: 1 },
    { id: 'purple_first',icon: '&#128156;', name: 'Фиолетовый охотник', desc: 'Найди фиолетовую группу первой',    reward: 30, target: 1 },
];

// =============================================
// DATE HELPERS
// =============================================
function getToday() {
    return new Date().toISOString().slice(0, 10);
}

function getYesterday() {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
}

function getWeekId() {
    const d = new Date();
    // Use date-only to avoid fractional-day drift from time-of-day
    const date = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    // ISO 8601: week starts Monday; week number defined by which year contains Thursday
    const day = date.getDay() || 7; // Sunday=0 → 7, Monday=1, ..., Saturday=6
    // Set to Thursday of the current week
    date.setDate(date.getDate() + 4 - day);
    const year = date.getFullYear();
    const jan1 = new Date(year, 0, 1);
    const weekNum = Math.ceil(((date - jan1) / 86400000 + 1) / 7);
    return `${year}-W${String(weekNum).padStart(2, '0')}`;
}

function dateSeed(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
    }
    return Math.abs(hash);
}

// =============================================
// PURPLE COLOR DETECTION
// =============================================
function isPurpleish(hex) {
    if (!hex || hex.length < 7) return false;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    // Purple: high blue, moderate red, low green relative to blue
    return b > 100 && r > 80 && g < b * 0.8 && (r + b) > g * 2.5;
}

// =============================================
// STREAK
// =============================================
function getStreakBonus() {
    const s = save.dailyStreak;
    if (s >= 10) return 0.5;
    if (s >= 6) return 0.25;
    if (s >= 3) return 0.1;
    return 0;
}

function getStreakBonusLabel() {
    const b = getStreakBonus();
    if (b > 0) return `+${Math.round(b * 100)}%`;
    return '';
}

function updateDailyStreak() {
    const today = getToday();
    if (save.lastPlayDate === today) return;

    if (save.lastPlayDate === getYesterday()) {
        save.dailyStreak++;
    } else {
        save.dailyStreak = 1;
    }

    if (save.dailyStreak > save.bestDailyStreak) {
        save.bestDailyStreak = save.dailyStreak;
    }

    save.lastPlayDate = today;
}

// =============================================
// DAILY CHALLENGES
// =============================================
function generateDailyChallenges(dateStr) {
    const seed = dateSeed(dateStr);
    const pool = [...DAILY_CHALLENGE_POOL];
    const picked = [];
    for (let i = 0; i < 3; i++) {
        const idx = (seed + i * 7 + i * i * 13) % pool.length;
        const template = pool.splice(idx, 1)[0];
        picked.push({ id: template.id, progress: 0, completed: false });
    }
    return picked;
}

function checkDailyReset() {
    const today = getToday();

    // Reset daily challenges if new day
    if (!save.dailyChallenges || save.dailyChallenges.date !== today) {
        save.dailyChallenges = {
            date: today,
            tasks: generateDailyChallenges(today),
            allCompleted: false,
            claimed: false
        };
        save.dailyGamesPlayed = 0;
        save.dailyGamesWon = 0;
    }

    // Reset daily puzzle if new day
    if (save.dailyPuzzleDate !== today) {
        save.dailyPuzzleCompleted = false;
        save.dailyPuzzleStars = 0;
    }

    // Reset weekly challenge if new week
    const weekId = getWeekId();
    if (!save.weeklyChallenge || save.weeklyChallenge.weekId !== weekId) {
        save.weeklyChallenge = {
            weekId: weekId,
            completed: false,
            claimed: false
        };
    }

    // Reset weekly puzzle if new week
    if (save.weeklyPuzzleWeekId !== weekId) {
        save.weeklyPuzzleCompleted = false;
        save.weeklyPuzzleStars = 0;
    }

    writeSave(save);
}

function checkDailyChallengeProgress(roundData) {
    if (!save.dailyChallenges || save.dailyChallenges.date !== getToday()) return [];

    const completedNow = [];
    const tasks = save.dailyChallenges.tasks;

    tasks.forEach(task => {
        if (task.completed) return;
        const def = DAILY_CHALLENGE_POOL.find(d => d.id === task.id);
        if (!def) return;

        let done = false;

        switch (task.id) {
            case 'no_mistakes':
                if (roundData.won && roundData.mistakesMade === 0) done = true;
                break;
            case 'speed_90':
                if (roundData.won && roundData.elapsed < 90) done = true;
                break;
            case 'no_hints':
                if (roundData.won && roundData.hintsUsed === 0) done = true;
                break;
            case 'play_3':
                task.progress++;
                if (task.progress >= def.target) done = true;
                break;
            case 'win_2':
                if (roundData.won) task.progress++;
                if (task.progress >= def.target) done = true;
                break;
            case 'combo_3':
                if (roundData.won && roundData.maxCombo >= 3) done = true;
                break;
            case 'hard_win':
                if (roundData.won && (roundData.difficulty === 'hard' || roundData.difficulty === 'expert')) done = true;
                break;
            case 'purple_first':
                if (roundData.won && roundData.solvedCats.length > 0) {
                    const firstColor = roundData.solvedCats[0].color;
                    if (isPurpleish(firstColor)) done = true;
                }
                break;
        }

        if (done) {
            task.completed = true;
            task.progress = def.target;
            completedNow.push(def);
            save.coins += def.reward;
        }
    });

    // Check if all completed
    if (tasks.every(t => t.completed) && !save.dailyChallenges.allCompleted) {
        save.dailyChallenges.allCompleted = true;
    }

    return completedNow;
}

function claimDailyBonus() {
    if (!save.dailyChallenges || !save.dailyChallenges.allCompleted || save.dailyChallenges.claimed) return false;
    save.dailyChallenges.claimed = true;
    save.coins += DAILY_BONUS_ALL;
    writeSave(save);
    return true;
}

// =============================================
// WEEKLY CHALLENGE
// =============================================
let isWeeklyChallenge = false;

function launchWeeklyChallenge() {
    if (!save.weeklyChallenge || save.weeklyChallenge.completed) return;

    const weekly = getWeeklyPuzzle();
    isWeeklyChallenge = true;

    // Override puzzle selection directly (like launchDailyPuzzle)
    puzzle = weekly.puzzle;
    difficulty = weekly.puzzle.difficulty;
    puzzleIndex = weekly.index;
    isEndless = false;
    maxMist = DIFF_META[difficulty].attempts;
    initRound();
}

function checkWeeklyChallengeComplete(won) {
    if (!isWeeklyChallenge) return false;
    isWeeklyChallenge = false;

    if (won && save.weeklyChallenge && !save.weeklyChallenge.completed) {
        save.weeklyChallenge.completed = true;
        return true;
    }
    return false;
}

function claimWeeklyReward() {
    if (!save.weeklyChallenge || !save.weeklyChallenge.completed || save.weeklyChallenge.claimed) return null;
    save.weeklyChallenge.claimed = true;
    save.coins += WEEKLY_COIN_REWARD;
    save.xp += WEEKLY_XP_REWARD;

    // Level up check after XP gain
    let weeklyLeveledUp = false;
    while (save.xp >= xpForLevel(save.level)) {
        save.xp -= xpForLevel(save.level);
        save.level++;
        weeklyLeveledUp = true;
    }

    writeSave(save);
    return weeklyLeveledUp;
}

// =============================================
// GAME INTEGRATION — called from game.js endRound()
// =============================================
function onRoundFinished(roundData) {
    // Streak already updated in endRound() before bonus calculation

    // Track daily games
    save.dailyGamesPlayed++;
    if (roundData.won) save.dailyGamesWon++;

    // Check daily challenge progress
    const completedChallenges = checkDailyChallengeProgress(roundData);

    // Check weekly challenge
    const weeklyDone = checkWeeklyChallengeComplete(roundData.won);

    writeSave(save);

    return {
        completedChallenges,
        weeklyDone,
        streakDays: save.dailyStreak,
        streakBonus: getStreakBonus()
    };
}

// =============================================
// RENDER WEEKLY CHALLENGE ON HOME SCREEN
// =============================================
function renderHomeWeekly() {
    const el = $('home-weekly');
    if (!el) return;

    if (!save.weeklyChallenge) { el.innerHTML = ''; return; }

    const wc = save.weeklyChallenge;
    let html = '';

    if (wc.completed && !wc.claimed) {
        html = `<div class="weekly-card completed">
            <div class="weekly-header">
                <span class="weekly-icon">&#127942;</span>
                <span class="weekly-title">Еженедельный челлендж</span>
            </div>
            <div class="weekly-desc">Завершён!</div>
            <button class="weekly-claim-btn" onclick="handleClaimWeeklyReward()">
                Забрать +${WEEKLY_COIN_REWARD} &#9679; и +${WEEKLY_XP_REWARD} XP
            </button>
        </div>`;
    } else if (wc.claimed) {
        html = `<div class="weekly-card done">
            <div class="weekly-header">
                <span class="weekly-icon">&#127942;</span>
                <span class="weekly-title">Еженедельный челлендж</span>
            </div>
            <div class="weekly-desc">&#10003; Выполнен на этой неделе</div>
        </div>`;
    } else {
        html = `<div class="weekly-card">
            <div class="weekly-header">
                <span class="weekly-icon">&#127942;</span>
                <span class="weekly-title">Еженедельный челлендж</span>
            </div>
            <div class="weekly-desc">Победи в сложном паззле недели!</div>
            <div class="weekly-reward">&#127873; ${WEEKLY_COIN_REWARD} &#9679; + ${WEEKLY_XP_REWARD} XP</div>
            <button class="weekly-play-btn" onclick="launchWeeklyChallenge()">Принять вызов</button>
        </div>`;
    }

    el.innerHTML = html;
}

// =============================================
// RENDER DAILY PUZZLE ON HOME SCREEN
// =============================================
function renderHomeDailyPuzzle() {
    const el = $('home-daily');
    if (!el) return;

    const completed = isDailyPuzzleCompleted();
    const stars = save.dailyPuzzleStars || 0;

    const starsHtml = completed
        ? `<span class="dp-stars">${'&#9733;'.repeat(stars)}${'&#9734;'.repeat(3 - stars)}</span>`
        : '';

    const desc = completed
        ? '&#10003; Пройден сегодня'
        : 'Лёгкий паззл, новый каждый день';

    el.innerHTML = `<button class="daily-puzzle-btn${completed ? ' completed' : ''}" onclick="launchDailyPuzzle()">
        <span class="dp-icon">&#128197;</span>
        <div class="dp-info">
            <div class="dp-title">Паззл дня</div>
            <div class="dp-desc">${desc}</div>
        </div>
        ${starsHtml}
        ${completed ? '' : '<span class="dp-arrow">&#9654;</span>'}
    </button>`;
}

// =============================================
// RENDER DAILY PANEL (Profile Screen)
// =============================================
function renderDailyPanel() {
    const panel = $('daily-panel');
    if (!panel) return;

    let html = '';

    // --- Streak ---
    const streak = save.dailyStreak || 0;
    const bonusLabel = getStreakBonusLabel();
    const playedToday = save.lastPlayDate === getToday();

    html += `<div class="daily-streak ${playedToday ? 'active' : streak > 0 ? 'warning' : ''}">
        <div class="streak-fire">&#128293;</div>
        <div class="streak-info">
            <div class="streak-count">${streak} ${pluralDays(streak)} подряд</div>
            ${bonusLabel
                ? `<div class="streak-bonus">${bonusLabel} к монетам</div>`
                : '<div class="streak-bonus">Играй каждый день!</div>'}
        </div>
        ${streak > 0 && !playedToday ? '<div class="streak-warn">&#9888;</div>' : ''}
    </div>`;

    // --- Daily challenges ---
    if (save.dailyChallenges && save.dailyChallenges.date === getToday()) {
        const tasks = save.dailyChallenges.tasks;
        html += '<div class="daily-challenges">';

        tasks.forEach(task => {
            const def = DAILY_CHALLENGE_POOL.find(d => d.id === task.id);
            if (!def) return;
            const progressText = def.target > 1 ? `${Math.min(task.progress, def.target)}/${def.target}` : '';

            html += `<div class="daily-task ${task.completed ? 'done' : ''}">
                <span class="daily-task-icon">${def.icon}</span>
                <div class="daily-task-info">
                    <div class="daily-task-name">${def.name}</div>
                    <div class="daily-task-desc">${def.desc}</div>
                </div>
                <div class="daily-task-right">
                    ${task.completed
                        ? '<span class="daily-task-check">&#10003;</span>'
                        : `<span class="daily-task-reward">+${def.reward} &#9679;</span>`}
                    ${progressText && !task.completed ? `<span class="daily-task-progress">${progressText}</span>` : ''}
                </div>
            </div>`;
        });

        // Claim button
        if (save.dailyChallenges.allCompleted && !save.dailyChallenges.claimed) {
            html += `<button class="daily-claim-btn" onclick="handleClaimDailyBonus()">
                &#127873; Забрать бонус +${DAILY_BONUS_ALL} &#9679;
            </button>`;
        } else if (save.dailyChallenges.claimed) {
            html += `<div class="daily-claimed">&#10003; Бонус получен!</div>`;
        }

        html += '</div>';
    }

    panel.innerHTML = html;
}

// =============================================
// CLAIM HANDLERS
// =============================================
function handleClaimDailyBonus() {
    if (claimDailyBonus()) {
        SFX.coin();
        haptic(20);
        showToast('&#127873;', `+${DAILY_BONUS_ALL} монет за все задания!`);
        renderDailyPanel();
        renderHomeDailyPuzzle();
        refreshProfile();
    }
}

function handleClaimWeeklyReward() {
    const leveledUp = claimWeeklyReward();
    if (leveledUp !== null) {
        SFX.ach();
        haptic([20, 50, 20]);
        showToast('&#127942;', `+${WEEKLY_COIN_REWARD} монет и +${WEEKLY_XP_REWARD} XP!`);
        if (leveledUp) {
            SFX.levelUp();
            showToast('&#11088;', `Новый уровень: ${save.level}!`);
        }
        renderHomeWeekly();
        renderDailyPanel();
        refreshProfile();
    }
}

// =============================================
// HELPERS
// =============================================
function pluralDays(n) {
    if (n % 10 === 1 && n % 100 !== 11) return 'день';
    if (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) return 'дня';
    return 'дней';
}
