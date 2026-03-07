/**
 * weeklypuzzlewords.js — Weekly puzzle pool
 *
 * Each week a harder puzzle is selected from this pool using a week-based seed.
 * These are "hard/expert" puzzles with tricky connections, humor, and Russian culture themes.
 */
const WEEKLY_PUZZLES = [

  // Week 1 — Russian double meanings
  {
    difficulty: "hard",
    categories: [
      { theme: "СЛОВА С ДВОЙНЫМ СМЫСЛОМ", words: ["КЛЮЧ", "ЛИСТ", "КОСА", "МЫШКА"], color: "#f9df6d" },
      { theme: "___УШКА", words: ["ПОДУШКА", "ЛОВУШКА", "КУКУШКА", "КАТЮШКА"], color: "#a0c35a" },
      { theme: "РУССКИЕ НАРОДНЫЕ СКАЗКИ", words: ["КОЛОБОК", "РЕПКА", "ТЕРЕМОК", "МОРОЗКО"], color: "#b0c4ef" },
      { theme: "ФРАЗЫ ИЗ СОВЕТСКИХ ФИЛЬМОВ", words: ["НАДО", "КРАСОТА", "ОДНАКО", "ЭЛЕМЕНТАРНО"], color: "#ba81c5" }
    ]
  },

  // Week 2 — Russian wordplay & culture
  {
    difficulty: "expert",
    categories: [
      { theme: "СЛОВА-ПАЛИНДРОМЫ", words: ["КАЗАК", "ШАЛАШ", "ДОВОД", "ЗАКАЗ"], color: "#f9df6d" },
      { theme: "ПЕРСОНАЖИ ЧЕХОВА", words: ["КАШТАНКА", "ИОНЫЧ", "НИНА", "ТРИГОРИН"], color: "#a0c35a" },
      { theme: "СОВЕТСКИЕ АВТОМОБИЛИ", words: ["ВОЛГА", "МОСКВИЧ", "ЗАПОРОЖЕЦ", "НИВА"], color: "#b0c4ef" },
      { theme: "РУССКИЕ СУЕВЕРИЯ", words: ["ЗЕРКАЛО", "ЧЁРНАЯ", "ТРИНАДЦАТЬ", "ПОРОГ"], color: "#ba81c5" }
    ]
  },

  // Week 3 — Russian literature & language
  {
    difficulty: "hard",
    categories: [
      { theme: "ГЕРОИ ПУШКИНА", words: ["ОНЕГИН", "ГЕРМАН", "ДУБРОВСКИЙ", "ГРИНЁВ"], color: "#f9df6d" },
      { theme: "ЛИТЕРАТУРНЫЕ ГЕРОИ", words: ["ПЕЧОРИН", "БАЗАРОВ", "ЧАЦКИЙ", "РАСКОЛЬНИКОВ"], color: "#a0c35a" },
      { theme: "РУССКИЕ КОМПОЗИТОРЫ", words: ["ЧАЙКОВСКИЙ", "РАХМАНИНОВ", "МУСОРГСКИЙ", "ГЛИНКА"], color: "#b0c4ef" },
      { theme: "ВИДЫ ПИСЬМЕННОСТИ", words: ["КИРИЛЛИЦА", "ЛАТИНИЦА", "ИЕРОГЛИФЫ", "РУНЫ"], color: "#ba81c5" }
    ]
  },

  // Week 4 — Architecture & high culture
  {
    difficulty: "expert",
    categories: [
      { theme: "ЗДАНИЯ МОСКВЫ", words: ["КРЕМЛЬ", "ГУМ", "БОЛЬШОЙ", "ТРЕТЬЯКОВКА"], color: "#f9df6d" },
      { theme: "АРХИТЕКТУРНЫЕ СТИЛИ", words: ["БАРОККО", "ГОТИКА", "МОДЕРН", "АМПИР"], color: "#a0c35a" },
      { theme: "ПОЭТИЧЕСКИЕ РАЗМЕРЫ", words: ["ЯМБ", "ХОРЕЙ", "ДАКТИЛЬ", "АНАПЕСТ"], color: "#b0c4ef" },
      { theme: "ТИПЫ ЛОГИКИ", words: ["ДЕДУКЦИЯ", "ИНДУКЦИЯ", "АНАЛОГИЯ", "АБДУКЦИЯ"], color: "#ba81c5" }
    ]
  },

  // Week 5 — Russian food & traditions
  {
    difficulty: "hard",
    categories: [
      { theme: "БЛЮДА РУССКОЙ КУХНИ", words: ["ПЕЛЬМЕНИ", "БЛИНЫ", "ОКРОШКА", "СОЛЯНКА"], color: "#f9df6d" },
      { theme: "ФИГУРЫ РЕЧИ", words: ["МЕТАФОРА", "ГИПЕРБОЛА", "ИРОНИЯ", "ЛИТОТА"], color: "#a0c35a" },
      { theme: "МАСЛЕНИЦА", words: ["ЧУЧЕЛО", "СКОВОРОДА", "ПРОЩЕНИЕ", "ВЕСНА"], color: "#b0c4ef" },
      { theme: "РУССКИЕ ПОСЛОВИЦЫ: ___ НЕ ВОРОБЕЙ", words: ["СЛОВО", "СИНИЦА", "ЖУРАВЛЬ", "ВОРОНА"], color: "#ba81c5" }
    ]
  },

  // Week 6 — Art & music with Russian twist
  {
    difficulty: "expert",
    categories: [
      { theme: "КАРТИНЫ ТРЕТЬЯКОВКИ", words: ["БОГАТЫРИ", "УТРО", "ГРАЧИ", "ДЕВЯТЫЙ"], color: "#f9df6d" },
      { theme: "ГРУППЫ РУССКОГО РОКА", words: ["КИНО", "АКВАРИУМ", "ДДТ", "АЛИСА"], color: "#a0c35a" },
      { theme: "ПЕРСОНАЖИ БУЛГАКОВА", words: ["ВОЛАНД", "МАРГАРИТА", "БЕГЕМОТ", "КОРОВЬЕВ"], color: "#b0c4ef" },
      { theme: "МУЗЫКАЛЬНЫЕ ТЕРМИНЫ", words: ["ФОРТЕ", "ПИАНО", "ЛЕГАТО", "СТАККАТО"], color: "#ba81c5" }
    ]
  },

  // Week 7 — Geography & nature of Russia
  {
    difficulty: "hard",
    categories: [
      { theme: "ОЗЁРА РОССИИ", words: ["БАЙКАЛ", "ЛАДОГА", "ОНЕГА", "СЕЛИГЕР"], color: "#f9df6d" },
      { theme: "ГОРОДА ЗОЛОТОГО КОЛЬЦА", words: ["СУЗДАЛЬ", "ВЛАДИМИР", "ЯРОСЛАВЛЬ", "КОСТРОМА"], color: "#a0c35a" },
      { theme: "ЛИТЕРАТУРНЫЕ ЖАНРЫ", words: ["НОВЕЛЛА", "ЭПОПЕЯ", "ПРИТЧА", "БАЛЛАДА"], color: "#b0c4ef" },
      { theme: "РУССКИЕ НАРОДНЫЕ ИНСТРУМЕНТЫ", words: ["БАЛАЛАЙКА", "ГУСЛИ", "ДОМРА", "ЖАЛЕЙКА"], color: "#ba81c5" }
    ]
  },

  // Week 8 — Soviet & modern Russia
  {
    difficulty: "expert",
    categories: [
      { theme: "КОСМОНАВТЫ СССР", words: ["ГАГАРИН", "ТЕРЕШКОВА", "ЛЕОНОВ", "ТИТОВ"], color: "#f9df6d" },
      { theme: "ТИПЫ ГОСУДАРСТВ", words: ["МОНАРХИЯ", "РЕСПУБЛИКА", "ФЕДЕРАЦИЯ", "ИМПЕРИЯ"], color: "#a0c35a" },
      { theme: "СОВЕТСКИЕ МУЛЬТФИЛЬМЫ", words: ["ПРОСТОКВАШИНО", "БРЕМЕНСКИЕ", "КАРЛСОН", "ВИННИ-ПУХ"], color: "#b0c4ef" },
      { theme: "ФИЛОСОФЫ НОВОГО ВРЕМЕНИ", words: ["ДЕКАРТ", "ЛОКК", "СПИНОЗА", "ЛЕЙБНИЦ"], color: "#ba81c5" }
    ]
  },

  // Week 9 — Tricky Russian wordplay
  {
    difficulty: "hard",
    categories: [
      { theme: "ДРАГОЦЕННЫЕ КАМНИ", words: ["АЛМАЗ", "РУБИН", "САПФИР", "ИЗУМРУД"], color: "#f9df6d" },
      { theme: "МОЖНО ЗАБИТЬ", words: ["ГОЛ", "ГВОЗДЬ", "СТРЕЛКУ", "ТРЕВОГУ"], color: "#a0c35a" },
      { theme: "РУССКИЕ ЦАРИ", words: ["ПЁТР", "ИВАН", "НИКОЛАЙ", "ЕКАТЕРИНА"], color: "#b0c4ef" },
      { theme: "ТИПЫ ТЕМПЕРАМЕНТА", words: ["ХОЛЕРИК", "САНГВИНИК", "МЕЛАНХОЛИК", "ФЛЕГМАТИК"], color: "#ba81c5" }
    ]
  },

  // Week 10 — Brain teasers
  {
    difficulty: "expert",
    categories: [
      { theme: "ЛОГИЧЕСКИЕ ПАРАДОКСЫ", words: ["ЛЖЕЦ", "АХИЛЛЕС", "ВОРОН", "БРАДОБРЕЙ"], color: "#f9df6d" },
      { theme: "РУССКИЕ ИЗОБРЕТЕНИЯ", words: ["РАДИО", "ВЕРТОЛЁТ", "ТЕТРИС", "САМОВАР"], color: "#a0c35a" },
      { theme: "ПРОИЗВЕДЕНИЯ ДОСТОЕВСКОГО", words: ["ИДИОТ", "БЕСЫ", "ИГРОК", "ПОДРОСТОК"], color: "#b0c4ef" },
      { theme: "ОПТИЧЕСКИЕ ЯВЛЕНИЯ", words: ["МИРАЖ", "РАДУГА", "ГАЛО", "РЕФРАКЦИЯ"], color: "#ba81c5" }
    ]
  },

  // Week 11 — Russian nature & science
  {
    difficulty: "hard",
    categories: [
      { theme: "ЭКОСИСТЕМЫ РОССИИ", words: ["ТУНДРА", "ТАЙГА", "СТЕПЬ", "ЛЕСОТУНДРА"], color: "#f9df6d" },
      { theme: "ЖАНРЫ ЖИВОПИСИ", words: ["ПОРТРЕТ", "ПЕЙЗАЖ", "НАТЮРМОРТ", "МАРИНА"], color: "#a0c35a" },
      { theme: "РУССКИЕ УЧЁНЫЕ", words: ["МЕНДЕЛЕЕВ", "ЛОМОНОСОВ", "ПАВЛОВ", "КОРОЛЁВ"], color: "#b0c4ef" },
      { theme: "ТИПЫ ИЗЛУЧЕНИЯ", words: ["АЛЬФА", "БЕТА", "ГАММА", "РЕНТГЕН"], color: "#ba81c5" }
    ]
  },

  // Week 12 — Deep Russian culture
  {
    difficulty: "expert",
    categories: [
      { theme: "ГЕРОИ ГОГОЛЯ", words: ["ЧИЧИКОВ", "ХЛЕСТАКОВ", "ТАРАС", "АКАКИЙ"], color: "#f9df6d" },
      { theme: "РУССКИЙ БАЛЕТ", words: ["ЛЕБЕДИНОЕ", "ЖИЗЕЛЬ", "ЩЕЛКУНЧИК", "СПАРТАК"], color: "#a0c35a" },
      { theme: "ФОРМЫ ПРАВЛЕНИЯ", words: ["ДЕСПОТИЯ", "ОЛИГАРХИЯ", "ТИРАНИЯ", "ОХЛОКРАТИЯ"], color: "#b0c4ef" },
      { theme: "СЛОВА ИЗ ТЮРКСКОГО", words: ["БАЗАР", "КАРАВАН", "СУНДУК", "БАШМАК"], color: "#ba81c5" }
    ]
  },

  // Week 13 — Fun & tricky
  {
    difficulty: "hard",
    categories: [
      { theme: "МОЖНО ПОСТАВИТЬ", words: ["ТОЧКУ", "ДИАГНОЗ", "РЕКОРД", "ОЦЕНКУ"], color: "#f9df6d" },
      { theme: "РЕКИ РОССИИ", words: ["ВОЛГА", "ЛЕНА", "ОБЬ", "ЕНИСЕЙ"], color: "#a0c35a" },
      { theme: "ОРКЕСТРОВЫЕ ГРУППЫ", words: ["СТРУННЫЕ", "ДУХОВЫЕ", "УДАРНЫЕ", "МЕДНЫЕ"], color: "#b0c4ef" },
      { theme: "МАСТИ РУССКИХ ЛОШАДЕЙ", words: ["ВОРОНАЯ", "ГНЕДАЯ", "КАУРАЯ", "БУЛАНАЯ"], color: "#ba81c5" }
    ]
  },

  // Week 14 — Russian humor & language
  {
    difficulty: "expert",
    categories: [
      { theme: "МОЖНО БРОСИТЬ", words: ["КУРИТЬ", "ЯКОРЬ", "ВЫЗОВ", "ВЗГЛЯД"], color: "#f9df6d" },
      { theme: "РУССКИЕ ХУДОЖНИКИ", words: ["РЕПИН", "ШИШКИН", "АЙВАЗОВСКИЙ", "ЛЕВИТАН"], color: "#a0c35a" },
      { theme: "СЛОВА С ПРИСТАВКОЙ ПРЕ-", words: ["ПРЕДАТЕЛЬ", "ПРЕЗИДЕНТ", "ПРЕЛЕСТЬ", "ПРЕСТУПНИК"], color: "#b0c4ef" },
      { theme: "СТАНЦИИ МЕТРО МОСКВЫ", words: ["АРБАТСКАЯ", "ЛУБЯНКА", "КИТАЙ-ГОРОД", "СОКОЛ"], color: "#ba81c5" }
    ]
  },

  // Week 15 — Deep cuts
  {
    difficulty: "hard",
    categories: [
      { theme: "РУССКИЕ ПРАЗДНИКИ", words: ["МАСЛЕНИЦА", "КРЕЩЕНИЕ", "КУПАЛА", "СПАС"], color: "#f9df6d" },
      { theme: "МОЖНО СНЯТЬ", words: ["ФИЛЬМ", "ШЛЯПУ", "КВАРТИРУ", "МЕРКУ"], color: "#a0c35a" },
      { theme: "ПЕРСОНАЖИ ТОЛСТОГО", words: ["НАТАША", "АНДРЕЙ", "ПЬЕР", "КАРЕНИНА"], color: "#b0c4ef" },
      { theme: "РУССКИЕ ТАНЦЫ", words: ["КАЗАЧОК", "БАРЫНЯ", "КАЛИНКА", "ТРЕПАК"], color: "#ba81c5" }
    ]
  },

  // Week 16 — Expert Russian culture
  {
    difficulty: "expert",
    categories: [
      { theme: "СЛОВА НАОБОРОТ = ДРУГОЕ СЛОВО", words: ["ТОН", "ВОР", "МАЛ", "КОТ"], color: "#f9df6d" },
      { theme: "ПЕСНИ ВЫСОЦКОГО", words: ["КОНИ", "ОХОТА", "ПАРУС", "КАНАТОХОДЕЦ"], color: "#a0c35a" },
      { theme: "РУССКИЕ ПРОМЫСЛЫ", words: ["ХОХЛОМА", "ГЖЕЛЬ", "ПАЛЕХ", "ЖОСТОВО"], color: "#b0c4ef" },
      { theme: "МАТЕМАТИЧЕСКИЕ ПОНЯТИЯ", words: ["ФРАКТАЛ", "МНОЖЕСТВО", "ПРЕДЕЛ", "ИНТЕГРАЛ"], color: "#ba81c5" }
    ]
  }

];

// =============================================
// WEEKLY PUZZLE SELECTION
// =============================================

/**
 * Get this week's puzzle using week-based seed.
 */
function getWeeklyPuzzle() {
    const weekId = getWeekId();
    const seed = dateSeed('weekly_' + weekId);
    const idx = seed % WEEKLY_PUZZLES.length;
    return { puzzle: WEEKLY_PUZZLES[idx], index: idx, weekId: weekId };
}

/**
 * Check if this week's puzzle is completed.
 */
function isWeeklyPuzzleCompleted() {
    const weekId = getWeekId();
    return save.weeklyPuzzleWeekId === weekId && save.weeklyPuzzleCompleted;
}

/**
 * Mark weekly puzzle as completed and submit speed to leaderboard.
 */
function completeWeeklyPuzzle(stars, elapsed) {
    const weekId = getWeekId();
    save.weeklyPuzzleWeekId = weekId;
    save.weeklyPuzzleCompleted = true;
    save.weeklyPuzzleStars = stars;
    save.weeklyPuzzlesTotal = (save.weeklyPuzzlesTotal || 0) + 1;
    writeSave(save);

    // Submit speed to weekly leaderboard
    if (elapsed !== undefined) {
        submitWeeklySpeed(weekId, elapsed);
    }
}

/**
 * Submit weekly puzzle completion time to server.
 * Returns a promise with { rank, total }.
 */
async function submitWeeklySpeed(weekId, time) {
    const id = ensurePlayerId();
    const name = getPlayerName();

    try {
        const res = await fetch('/api/weekly-speed', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, name, weekId, time })
        });
        const data = await res.json();
        if (data.rank) {
            save.weeklySpeedRank = data.rank;
            save.weeklySpeedTotal = data.total;
            save.weeklySpeedTime = time;
            save.weeklySpeedWeekId = weekId;
            writeSave(save);
        }
        return data;
    } catch (e) {
        console.warn('Weekly speed submit failed:', e.message);
        return null;
    }
}

/**
 * Launch this week's puzzle.
 */
let isWeeklyPuzzleMode = false;

function launchWeeklyPuzzle() {
    if (isWeeklyPuzzleCompleted()) {
        showToast('&#10003;', 'Еженедельный паззл уже пройден!');
        return;
    }

    const weekly = getWeeklyPuzzle();
    isWeeklyPuzzleMode = true;

    // Override puzzle selection
    puzzle = weekly.puzzle;
    difficulty = weekly.puzzle.difficulty;
    puzzleIndex = weekly.index;
    isEndless = false;
    maxMist = DIFF_META[difficulty].attempts;
    initRound();
}
