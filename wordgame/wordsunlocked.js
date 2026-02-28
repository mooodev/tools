/**
 * wordsunlocked.js — Дополнительные слова (бонусная подборка)
 * Добавляются к основному массиву WORD_PUZZLES при загрузке.
 * По 1 категории каждой сложности для теста.
 */
const BONUS_WORD_PUZZLES = [

  // EASY
  {
    difficulty: "easy",
    categories: [
      { theme: "СКАЗОЧНЫЕ ГЕРОИ", words: ["КОЛОБОК", "БУРАТИНО", "ЗОЛУШКА", "РУСАЛОЧКА"], color: "#f9df6d" },
      { theme: "МОЛОЧНЫЕ КОКТЕЙЛИ", words: ["ВАНИЛЬ", "ШОКОЛАД", "КЛУБНИКА", "КАРАМЕЛЬ"], color: "#a0c35a" },
      { theme: "ВИДЫ МЯЧЕЙ", words: ["ФУТБОЛЬНЫЙ", "ТЕННИСНЫЙ", "БАСКЕТБОЛЬНЫЙ", "ВОЛЕЙБОЛЬНЫЙ"], color: "#b0c4ef" },
      { theme: "ПАРК РАЗВЛЕЧЕНИЙ", words: ["КАРУСЕЛЬ", "ГОРКА", "КАЧЕЛИ", "КОЛЕСО"], color: "#ba81c5" }
    ]
  },

  // MEDIUM
  {
    difficulty: "medium",
    categories: [
      { theme: "ВИДЫ МОРОЖЕНОГО", words: ["ПЛОМБИР", "СОРБЕТ", "КРЕМ-БРЮЛЕ", "ДЖЕЛАТО"], color: "#f9df6d" },
      { theme: "ВИДЫ ФОТОГРАФИИ", words: ["ПОРТРЕТ", "ПЕЙЗАЖ", "МАКРО", "РЕПОРТАЖ"], color: "#a0c35a" },
      { theme: "ВИДЫ ОБЛАКОВ", words: ["КУМУЛЮС", "ЦИРРУС", "СТРАТУС", "НИМБУС"], color: "#b0c4ef" },
      { theme: "ВИДЫ КАШИ", words: ["МАННАЯ", "РИСОВАЯ", "ГРЕЧНЕВАЯ", "ОВСЯНАЯ"], color: "#ba81c5" }
    ]
  },

  // HARD
  {
    difficulty: "hard",
    categories: [
      { theme: "СЛОВА С ПРИСТАВКОЙ ПОД-", words: ["ПОДВИГ", "ПОДКОВА", "ПОДСНЕЖНИК", "ПОДОКОННИК"], color: "#f9df6d" },
      { theme: "ДРЕВНИЕ ЧУДЕСА СВЕТА", words: ["ПИРАМИДА", "КОЛОСС", "МАЯК", "МАВЗОЛЕЙ"], color: "#a0c35a" },
      { theme: "ВИДЫ ШРИФТОВ", words: ["АНТИКВА", "ГРОТЕСК", "КУРСИВ", "МОНОШИРИННЫЙ"], color: "#b0c4ef" },
      { theme: "ВИДЫ РЕЗЬБЫ", words: ["МЕТРИЧЕСКАЯ", "ДЮЙМОВАЯ", "ТРАПЕЦЕИДАЛЬНАЯ", "УПОРНАЯ"], color: "#ba81c5" }
    ]
  },

  // EXPERT
  {
    difficulty: "expert",
    categories: [
      { theme: "ЦВЕТ = ИДИОМА", words: ["БЕЛАЯ ВОРОНА", "ЧЁРНАЯ ОВЦА", "СЕРЫЙ КАРДИНАЛ", "ГОЛУБАЯ КРОВЬ"], color: "#f9df6d" },
      { theme: "ЭФФЕКТЫ В ПСИХОЛОГИИ", words: ["БАРНУМ", "ДАННИНГ-КРЮГЕР", "ЗЕЙГАРНИК", "ПИГМАЛИОН"], color: "#a0c35a" },
      { theme: "ТИПЫ ПАРАДОКСОВ ВРЕМЕНИ", words: ["ПРЕДОПРЕДЕЛЕНИЕ", "БЛИЗНЕЦОВ", "ДЕДУШКИН", "БУТСТРЭП"], color: "#b0c4ef" },
      { theme: "ВИДЫ РЕКУРСИИ", words: ["ПРЯМАЯ", "КОСВЕННАЯ", "ХВОСТОВАЯ", "ВЗАИМНАЯ"], color: "#ba81c5" }
    ]
  }

];

/**
 * Append bonus puzzles to WORD_PUZZLES if not already present.
 * Called when bonusWordsUnlocked flag is set in save data.
 */
function appendBonusWords() {
    if (typeof WORD_PUZZLES === 'undefined' || !Array.isArray(WORD_PUZZLES)) return false;
    let added = 0;
    BONUS_WORD_PUZZLES.forEach(bp => {
        const alreadyExists = WORD_PUZZLES.some(p =>
            p.difficulty === bp.difficulty &&
            p.categories.length === bp.categories.length &&
            p.categories[0] && bp.categories[0] &&
            p.categories[0].theme === bp.categories[0].theme
        );
        if (!alreadyExists) {
            WORD_PUZZLES.push(bp);
            added++;
        }
    });
    return added > 0;
}

/**
 * Remove bonus puzzles from WORD_PUZZLES (if present).
 * Used to ensure clean state when bonus is not unlocked.
 */
function removeBonusWords() {
    if (typeof WORD_PUZZLES === 'undefined' || !Array.isArray(WORD_PUZZLES)) return;
    for (let i = WORD_PUZZLES.length - 1; i >= 0; i--) {
        const p = WORD_PUZZLES[i];
        const isBonus = BONUS_WORD_PUZZLES.some(bp =>
            bp.difficulty === p.difficulty &&
            bp.categories.length === p.categories.length &&
            bp.categories[0] && p.categories[0] &&
            p.categories[0].theme === bp.categories[0].theme
        );
        if (isBonus) {
            WORD_PUZZLES.splice(i, 1);
        }
    }
}

/**
 * Unlock bonus words: set save flag + append to WORD_PUZZLES.
 * Returns true if newly unlocked, false if already was.
 */
function unlockBonusWords() {
    if (typeof save !== 'undefined' && save.bonusWordsUnlocked) {
        appendBonusWords(); // ensure appended even if flag already set
        return false;
    }
    appendBonusWords();
    if (typeof save !== 'undefined') {
        save.bonusWordsUnlocked = true;
        if (typeof writeSave === 'function') writeSave(save);
    }
    return true;
}
