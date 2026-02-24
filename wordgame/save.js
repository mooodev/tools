/**
 * save.js — Persistence, constants, achievements, XP/level formulas
 */

// =============================================
// CONSTANTS
// =============================================
const SAVE_KEY = 'svyazi_save_v2';

const DIFF_META = {
    easy:   { label: 'Лёгкий',   short: 'Лёгкий',  attempts: 5, baseXP: 50,  coinMult: 1, color: 'easy' },
    medium: { label: 'Средний',   short: 'Средний', attempts: 4, baseXP: 100, coinMult: 2, color: 'medium' },
    hard:   { label: 'Трудный',   short: 'Трудный', attempts: 3, baseXP: 200, coinMult: 3, color: 'hard' },
    expert: { label: 'Эксперт',   short: 'Эксперт', attempts: 2, baseXP: 400, coinMult: 5, color: 'expert' },
};

const HINT_REVEAL_COST = 20;
const HINT_REMOVE_COST = 15;

// =============================================
// XP / LEVELS / STARS
// =============================================
function xpForLevel(lvl) {
    return lvl * 200;
}

function getStars(mistakesMade, maxMistakes) {
    if (mistakesMade === 0) return 3;
    if (mistakesMade <= Math.floor(maxMistakes * 0.5)) return 2;
    return 1;
}

// =============================================
// ACHIEVEMENTS DEFINITIONS
// =============================================
const ACHIEVEMENTS = [
    { id: 'first_win',  icon: '&#127942;', name: 'Первая победа',     desc: 'Выиграй первый раунд' },
    { id: 'perfect',    icon: '&#11088;',  name: 'Безупречно',        desc: 'Выиграй раунд без ошибок' },
    { id: 'perfect_3',  icon: '&#128293;', name: 'В огне',            desc: '3 безупречных раунда подряд' },
    { id: 'streak_5',   icon: '&#9889;',   name: 'Не остановить',     desc: 'Победная серия из 5 раундов' },
    { id: 'streak_10',  icon: '&#127775;', name: 'Легенда',           desc: 'Победная серия из 10 раундов' },
    { id: 'all_easy',   icon: '&#127807;', name: 'Лёгкая прогулка',   desc: 'Пройди все лёгкие паззлы' },
    { id: 'all_medium', icon: '&#128170;', name: 'Уверенный игрок',   desc: 'Пройди все средние паззлы' },
    { id: 'all_hard',   icon: '&#129504;', name: 'Мастер связей',     desc: 'Пройди все трудные паззлы' },
    { id: 'all_expert', icon: '&#128142;', name: 'Гений',             desc: 'Пройди все экспертные паззлы' },
    { id: 'speed_60',   icon: '&#9201;',   name: 'Молния',            desc: 'Выиграй раунд менее чем за 60 секунд' },
    { id: 'no_hints',   icon: '&#129300;', name: 'Своим умом',        desc: 'Выиграй 5 раундов без подсказок' },
    { id: 'coins_500',  icon: '&#128176;', name: 'Богач',             desc: 'Накопи 500 монет' },
    { id: 'lvl_5',      icon: '&#127941;', name: 'Набирая обороты',   desc: 'Достигни 5-го уровня' },
    { id: 'lvl_10',     icon: '&#127881;', name: 'Ветеран',           desc: 'Достигни 10-го уровня' },
    { id: 'lvl_25',     icon: '&#128081;', name: 'Грандмастер',       desc: 'Достигни 25-го уровня' },
    { id: 'games_50',   icon: '&#127922;', name: 'Марафонец',         desc: 'Сыграй 50 раундов' },
    { id: 'endless_10', icon: '&#9854;',   name: 'Бесконечность',     desc: 'Выиграй 10 раундов в бесконечном режиме' },
    { id: 'combo_4',    icon: '&#128165;', name: 'Идеальное комбо',   desc: 'Угадай все 4 группы подряд без ошибок' },
];

// =============================================
// DEFAULT SAVE
// =============================================
const DEFAULT_SAVE = {
    xp: 0,
    level: 1,
    coins: 50,
    totalGames: 0,
    totalWins: 0,
    perfectGames: 0,
    currentStreak: 0,
    bestStreak: 0,
    categoriesFound: 0,
    hintsUsed: 0,
    completedPuzzles: {},  // key="easy_0", value=stars(1-3)
    achievements: [],
    endlessPlayed: 0,
    endlessWins: 0,
};

// =============================================
// LOAD / WRITE
// =============================================
function loadSave() {
    try {
        return { ...DEFAULT_SAVE, ...JSON.parse(localStorage.getItem(SAVE_KEY)) };
    } catch {
        return { ...DEFAULT_SAVE };
    }
}

function writeSave(s) {
    localStorage.setItem(SAVE_KEY, JSON.stringify(s));
}

function resetSave() {
    const fresh = { ...DEFAULT_SAVE };
    writeSave(fresh);
    return fresh;
}

// =============================================
// ACHIEVEMENT HELPERS
// =============================================
function hasAch(save, id) {
    return save.achievements.includes(id);
}

function unlockAch(save, id) {
    if (hasAch(save, id)) return false;
    save.achievements.push(id);
    return true;
}
