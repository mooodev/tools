/**
 * game.js — Core game logic: state, round lifecycle, hints, submission, scoring
 *
 * Depends on: save.js, audio.js, words.js, ui.js (for rendering calls)
 */

// =============================================
// GAME STATE
// =============================================
let save = loadSave();

let puzzle = null;
let difficulty = null;
let puzzleIndex = -1;
let isEndless = false;
let activeWords = [];
let solvedCats = [];
let selected = [];
let maxMist = 4;
let mistakesMade = 0;
let gameOver = false;
let combo = 0;
let maxCombo = 0;
let hintsUsedThisRound = 0;
let timerStart = 0;
let timerInterval = null;
let noHintWins = 0;
let removedWords = [];    // words temporarily removed by hint
let explainMode = false;  // true when waiting for word click to explain

// =============================================
// UTILITIES
// =============================================
function shuffleArray(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
}

// =============================================
// TIMER
// =============================================
function startTimer() {
    timerStart = Date.now();
    clearInterval(timerInterval);
    timerInterval = setInterval(updateTimerDisplay, 1000);
    updateTimerDisplay();
}

function stopTimer() {
    clearInterval(timerInterval);
}

function getElapsed() {
    return Math.floor((Date.now() - timerStart) / 1000);
}

function updateTimerDisplay() {
    const s = getElapsed();
    const el = document.getElementById('timer-display');
    if (el) el.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// =============================================
// LAUNCH GAME
// =============================================
function launchGame(diff, idx) {
    difficulty = diff;
    isEndless = false;
    const puzzles = WORD_PUZZLES.filter(p => p.difficulty === diff);

    if (idx !== undefined) {
        puzzleIndex = idx;
        puzzle = puzzles[idx];
    } else {
        const unplayed = puzzles.map((_, i) => i).filter(i =>
            save.completedPuzzles[`${diff}_${i}`] === undefined
        );
        if (unplayed.length) {
            puzzleIndex = unplayed[Math.floor(Math.random() * unplayed.length)];
        } else {
            puzzleIndex = Math.floor(Math.random() * puzzles.length);
        }
        puzzle = puzzles[puzzleIndex];
    }

    maxMist = DIFF_META[diff].attempts;
    initRound();
}

function launchEndless() {
    difficulty = ['easy', 'medium', 'hard', 'expert'][Math.floor(Math.random() * 4)];
    isEndless = true;
    const puzzles = WORD_PUZZLES.filter(p => p.difficulty === difficulty);
    puzzleIndex = Math.floor(Math.random() * puzzles.length);
    puzzle = puzzles[puzzleIndex];
    maxMist = DIFF_META[difficulty].attempts;
    initRound();
}

function initRound() {
    activeWords = [];
    puzzle.categories.forEach(cat => {
        cat.words.forEach(word => activeWords.push({ word, category: cat.theme }));
    });
    shuffleArray(activeWords);

    solvedCats = [];
    selected = [];
    mistakesMade = 0;
    gameOver = false;
    combo = 0;
    maxCombo = 0;
    hintsUsedThisRound = 0;
    removedWords = [];
    explainMode = false;

    // UI setup delegated to ui.js
    setupGameScreen();
    startTimer();
}

// =============================================
// SELECTION
// =============================================
function toggleSelect(item) {
    if (gameOver) return;
    hideMsg();

    // Explain mode: show word meaning instead of selecting
    if (explainMode) {
        explainMode = false;
        renderBoard();
        updateBtns();
        const meaning = typeof WORD_MEANINGS !== 'undefined' && WORD_MEANINGS[item.word];
        if (meaning) {
            showExplainPopup(item.word, meaning);
        } else {
            showMsg('Нет подсказки для этого слова', 'warn');
        }
        return;
    }

    const idx = selected.indexOf(item);
    if (idx > -1) {
        selected.splice(idx, 1);
        SFX.deselect();
        if (selected.length === 0) returnRemovedWords();
    } else if (selected.length < 4) {
        selected.push(item);
        SFX.select();
        haptic(5);
    }
    renderBoard();
    updateBtns();
}

// =============================================
// HINTS
// =============================================
function useHintExplain() {
    if (save.coins < HINT_REVEAL_COST || gameOver || activeWords.length === 0) return;
    save.coins -= HINT_REVEAL_COST;
    save.hintsUsed++;
    hintsUsedThisRound++;
    writeSave(save);
    SFX.hint();
    haptic(15);

    explainMode = true;
    renderBoard();
    updateBtns();
    showMsg('Нажмите на слово для объяснения', 'ok');
}

function cancelExplainMode() {
    if (explainMode) {
        explainMode = false;
        renderBoard();
        updateBtns();
        hideMsg();
    }
}

function returnRemovedWords() {
    if (removedWords.length === 0) return;
    // Return removed words that still belong to unsolved categories
    const solvedThemes = new Set(solvedCats.map(c => c.theme));
    removedWords.forEach(w => {
        if (!solvedThemes.has(w.category)) {
            activeWords.push(w);
        }
    });
    removedWords = [];
}

function useHintRemove() {
    // Must have exactly one word selected
    if (selected.length !== 1) {
        showMsg('Выберите одно слово!', 'warn');
        return;
    }
    if (save.coins < HINT_REMOVE_COST || gameOver || activeWords.length <= 4) return;

    // Find words NOT in the selected word's category
    const selectedCat = selected[0].category;
    const candidates = activeWords.filter(w => w.category !== selectedCat);
    if (candidates.length === 0) return;

    save.coins -= HINT_REMOVE_COST;
    save.hintsUsed++;
    hintsUsedThisRound++;
    writeSave(save);
    SFX.hint();
    haptic(15);

    const victim = candidates[Math.floor(Math.random() * candidates.length)];
    const victimIdx = activeWords.indexOf(victim);

    animateHintRemove(victimIdx, () => {
        activeWords.splice(activeWords.indexOf(victim), 1);
        selected = selected.filter(s => s !== victim);
        removedWords.push(victim);
        renderBoard(false);
        updateBtns();
    });
    showMsg('Лишнее слово убрано!', 'ok');
}

// =============================================
// SUBMISSION
// =============================================
function checkSubmission() {
    if (selected.length !== 4 || gameOver) return;

    const firstCat = selected[0].category;
    const isCorrect = selected.every(item => item.category === firstCat);

    if (isCorrect) {
        handleCorrectGuess(firstCat);
    } else {
        handleWrongGuess();
    }
    updateBtns();
}

function handleCorrectGuess(categoryTheme) {
    SFX.correct();
    haptic(20);
    combo++;
    if (combo > maxCombo) maxCombo = combo;

    const catData = puzzle.categories.find(c => c.theme === categoryTheme);
    solvedCats.push(catData);
    activeWords = activeWords.filter(item => item.category !== categoryTheme);
    selected = [];

    // Report duel progress
    if (typeof reportDuelProgress === 'function') reportDuelProgress();

    // Return removed words on correct guess
    returnRemovedWords();

    if (combo >= 2) {
        showCombo(combo);
        SFX.combo(combo);
    }

    if (activeWords.length === 0) {
        gameOver = true;
        stopTimer();
        renderBoard();
        updateBtns();
        setTimeout(() => endRound(true), 2000);
        return;
    }

    // Auto-solve last remaining category
    if (activeWords.length === 4) {
        const lastCat = activeWords[0].category;
        const lastCatData = puzzle.categories.find(c => c.theme === lastCat);
        renderBoard(true);
        showMsg(combo >= 2 ? `Комбо x${combo}!` : 'Верно!', combo >= 2 ? 'combo' : 'ok');

        setTimeout(() => {
            solvedCats.push(lastCatData);
            combo++;
            if (combo > maxCombo) maxCombo = combo;
            activeWords = [];
            gameOver = true;
            stopTimer();
            renderBoard();
            updateBtns();
            if (combo >= 2) { showCombo(combo); SFX.combo(combo); }
            setTimeout(() => endRound(true), 2000);
        }, 400);
        return;
    }

    renderBoard(true);
    showMsg(combo >= 2 ? `Комбо x${combo}!` : 'Верно!', combo >= 2 ? 'combo' : 'ok');
}

function handleWrongGuess() {
    SFX.wrong();
    haptic([30, 50, 30]);
    combo = 0;
    shakeSelected();
    mistakesMade++;
    animateMistakeLoss();

    const counts = {};
    selected.forEach(item => { counts[item.category] = (counts[item.category] || 0) + 1; });
    const hasThree = Object.values(counts).some(c => c === 3);

    if (mistakesMade >= maxMist) {
        const firstSelectedCategory = selected.length > 0 ? selected[0].category : null;
        gameOver = true;
        stopTimer();
        showMsg('Нет попыток!', 'error');
        setTimeout(() => {
            revealRemaining(firstSelectedCategory);
            setTimeout(() => endRound(false), 3500);
        }, 700);
    } else if (hasThree) {
        showMsg('Одно слово лишнее!', 'warn');
    } else {
        showMsg('Неверно!', 'error');
    }
}

function revealRemaining(onlyCategory) {
    selected = [];
    if (onlyCategory) {
        // Loss: only reveal the group the player was trying to guess
        const catData = puzzle.categories.find(c => c.theme === onlyCategory);
        if (catData && !solvedCats.find(sc => sc.theme === onlyCategory)) {
            solvedCats.push(catData);
        }
    } else {
        // Reveal all remaining
        [...new Set(activeWords.map(w => w.category))].forEach(theme => {
            solvedCats.push(puzzle.categories.find(c => c.theme === theme));
        });
    }
    activeWords = [];
    renderBoard();
}

// =============================================
// END ROUND — SCORING & ACHIEVEMENTS
// =============================================
function endRound(won) {
    const elapsed = getElapsed();
    const meta = DIFF_META[difficulty];
    let xpGain = 0;
    let coinsGain = 0;
    let stars = 0;
    const newAchs = [];

    // Update daily streak early so bonus applies to this round
    updateDailyStreak();

    if (won) {
        stars = getStars(mistakesMade, maxMist);

        // XP calculation
        xpGain = meta.baseXP;
        xpGain += (maxMist - mistakesMade) * 25;
        if (mistakesMade === 0) xpGain = Math.floor(xpGain * 1.5);
        if (elapsed < 60) xpGain += 50;
        else if (elapsed < 120) xpGain += 25;

        // Coins calculation
        coinsGain = 10 + (maxMist - mistakesMade) * 5;
        coinsGain *= meta.coinMult;

        // Apply daily streak bonus
        const streakMult = getStreakBonus();
        if (streakMult > 0) {
            coinsGain = Math.floor(coinsGain * (1 + streakMult));
        }

        // Update save stats
        save.totalWins++;
        save.currentStreak++;
        if (save.currentStreak > save.bestStreak) save.bestStreak = save.currentStreak;
        if (mistakesMade === 0) save.perfectGames++;

        if (hintsUsedThisRound === 0) noHintWins++;
        else noHintWins = 0;

        // Save puzzle completion
        if (!isEndless) {
            const key = `${difficulty}_${puzzleIndex}`;
            const prev = save.completedPuzzles[key] || 0;
            if (stars > prev) save.completedPuzzles[key] = stars;
        } else {
            save.endlessWins++;
        }
    } else {
        save.currentStreak = 0;
        noHintWins = 0;
    }

    save.totalGames++;
    save.categoriesFound += solvedCats.length;
    if (isEndless) save.endlessPlayed++;
    save.xp += xpGain;
    save.coins += coinsGain;

    // Level up check
    let leveledUp = false;
    let newLevel = save.level;
    while (save.xp >= xpForLevel(save.level)) {
        save.xp -= xpForLevel(save.level);
        save.level++;
        leveledUp = true;
        newLevel = save.level;
    }

    // Check achievements
    if (won && unlockAch(save, 'first_win'))                                       newAchs.push('first_win');
    if (won && mistakesMade === 0 && unlockAch(save, 'perfect'))                   newAchs.push('perfect');
    if (save.perfectGames >= 3 && unlockAch(save, 'perfect_3'))                    newAchs.push('perfect_3');
    if (save.currentStreak >= 5 && unlockAch(save, 'streak_5'))                    newAchs.push('streak_5');
    if (save.currentStreak >= 10 && unlockAch(save, 'streak_10'))                  newAchs.push('streak_10');
    if (elapsed < 60 && won && unlockAch(save, 'speed_60'))                        newAchs.push('speed_60');
    if (noHintWins >= 5 && unlockAch(save, 'no_hints'))                            newAchs.push('no_hints');
    if (save.coins >= 500 && unlockAch(save, 'coins_500'))                         newAchs.push('coins_500');
    if (save.level >= 5 && unlockAch(save, 'lvl_5'))                               newAchs.push('lvl_5');
    if (save.level >= 10 && unlockAch(save, 'lvl_10'))                             newAchs.push('lvl_10');
    if (save.level >= 25 && unlockAch(save, 'lvl_25'))                             newAchs.push('lvl_25');
    if (save.totalGames >= 50 && unlockAch(save, 'games_50'))                      newAchs.push('games_50');
    if (save.endlessWins >= 10 && unlockAch(save, 'endless_10'))                   newAchs.push('endless_10');
    if (won && combo >= 4 && unlockAch(save, 'combo_4'))                           newAchs.push('combo_4');

    // Check all-difficulty achievements
    for (const [dk, achId] of [['easy','all_easy'],['medium','all_medium'],['hard','all_hard'],['expert','all_expert']]) {
        if (!hasAch(save, achId)) {
            const total = WORD_PUZZLES.filter(p => p.difficulty === dk).length;
            const done = WORD_PUZZLES.filter((p, i) => p.difficulty === dk && save.completedPuzzles[`${dk}_${i}`] !== undefined).length;
            if (done >= total && total > 0) {
                if (unlockAch(save, achId)) newAchs.push(achId);
            }
        }
    }

    writeSave(save);

    // Report duel finish
    if (typeof reportDuelFinished === 'function' && isDuel) {
        reportDuelFinished(won, stars);
    }

    // Submit to leaderboard
    if (typeof submitToLeaderboard === 'function') {
        submitToLeaderboard();
    }

    // Daily engagement integration
    const dailyResult = onRoundFinished({
        won, mistakesMade, elapsed,
        hintsUsed: hintsUsedThisRound,
        maxCombo: maxCombo,
        solvedCats, puzzle, difficulty,
        coinsGain
    });

    // Delegate to UI
    showResultScreen(won, stars, xpGain, coinsGain, elapsed, leveledUp, newLevel, newAchs, dailyResult);
}
