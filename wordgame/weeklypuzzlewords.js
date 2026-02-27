/**
 * weeklypuzzlewords.js — Weekly puzzle pool
 *
 * Each week a harder puzzle is selected from this pool using a week-based seed.
 * These are "hard/expert" puzzles with trickier connections.
 */
const WEEKLY_PUZZLES = [

  // Week 1
  {
    difficulty: "hard",
    categories: [
      { theme: "СЛОВА С ДВОЙНЫМ СМЫСЛОМ", words: ["КЛЮЧ", "ЛИСТ", "КОСА", "МЫШКА"], color: "#f9df6d" },
      { theme: "ШАХМАТНЫЕ ТЕРМИНЫ", words: ["ПАТ", "МАТ", "ГАМБИТ", "РОКИРОВКА"], color: "#a0c35a" },
      { theme: "ВИДЫ ИСКУССТВА", words: ["ОПЕРА", "БАЛЕТ", "ЦИРК", "ТЕАТР"], color: "#b0c4ef" },
      { theme: "ЕДИНИЦЫ ВРЕМЕНИ", words: ["ВЕК", "ЭПОХА", "ЭРА", "ПЕРИОД"], color: "#ba81c5" }
    ]
  },

  // Week 2
  {
    difficulty: "expert",
    categories: [
      { theme: "СЛОВА-ПАЛИНДРОМЫ", words: ["КАЗАК", "ШАЛАШ", "ДОВОД", "ЗАКАЗ"], color: "#f9df6d" },
      { theme: "ФИЗИЧЕСКИЕ ВЕЛИЧИНЫ", words: ["АМПЕР", "ВАТТ", "ВОЛЬТ", "ГЕРЦ"], color: "#a0c35a" },
      { theme: "ГРЕЧЕСКИЕ БОГИ", words: ["ЗЕВС", "АРЕС", "ГЕРМЕС", "АПОЛЛОН"], color: "#b0c4ef" },
      { theme: "СЛОВА ИЗ 3 БУКВ", words: ["ДОМ", "КОТ", "СОН", "МИР"], color: "#ba81c5" }
    ]
  },

  // Week 3
  {
    difficulty: "hard",
    categories: [
      { theme: "ХИМИЧЕСКИЕ ЭЛЕМЕНТЫ", words: ["УГЛЕРОД", "КИСЛОРОД", "АЗОТ", "ВОДОРОД"], color: "#f9df6d" },
      { theme: "ЛИТЕРАТУРНЫЕ ГЕРОИ", words: ["ОНЕГИН", "ПЕЧОРИН", "БАЗАРОВ", "ЧАЦКИЙ"], color: "#a0c35a" },
      { theme: "ВИДЫ ПИСЬМЕННОСТИ", words: ["КИРИЛЛИЦА", "ЛАТИНИЦА", "ИЕРОГЛИФЫ", "РУНЫ"], color: "#b0c4ef" },
      { theme: "СОЗВЕЗДИЯ", words: ["ОРИОН", "КАССИОПЕЯ", "ЛЕБЕДЬ", "ДРАКОН"], color: "#ba81c5" }
    ]
  },

  // Week 4
  {
    difficulty: "expert",
    categories: [
      { theme: "МУЗЫКАЛЬНЫЕ ЛАДЫ", words: ["МАЖОР", "МИНОР", "ДОРИЙСКИЙ", "ФРИГИЙСКИЙ"], color: "#f9df6d" },
      { theme: "ФИЛОСОФСКИЕ ШКОЛЫ", words: ["СТОИКИ", "ЭПИКУРЕИЗМ", "КИНИЗМ", "СОФИСТЫ"], color: "#a0c35a" },
      { theme: "АРХИТЕКТУРНЫЕ СТИЛИ", words: ["БАРОККО", "ГОТИКА", "МОДЕРН", "РЕНЕССАНС"], color: "#b0c4ef" },
      { theme: "ТИПЫ ЛОГИКИ", words: ["ДЕДУКЦИЯ", "ИНДУКЦИЯ", "АНАЛОГИЯ", "АБДУКЦИЯ"], color: "#ba81c5" }
    ]
  },

  // Week 5
  {
    difficulty: "hard",
    categories: [
      { theme: "ПОЭТИЧЕСКИЕ РАЗМЕРЫ", words: ["ЯМБ", "ХОРЕЙ", "ДАКТИЛЬ", "АМФИБРАХИЙ"], color: "#f9df6d" },
      { theme: "ФИГУРЫ РЕЧИ", words: ["МЕТАФОРА", "ГИПЕРБОЛА", "ИРОНИЯ", "АЛЛЕГОРИЯ"], color: "#a0c35a" },
      { theme: "СТОРОНЫ СВЕТА", words: ["СЕВЕР", "ЮГ", "ЗАПАД", "ВОСТОК"], color: "#b0c4ef" },
      { theme: "СОСТОЯНИЯ ВЕЩЕСТВА", words: ["ТВЁРДОЕ", "ЖИДКОЕ", "ГАЗ", "ПЛАЗМА"], color: "#ba81c5" }
    ]
  },

  // Week 6
  {
    difficulty: "expert",
    categories: [
      { theme: "ХУДОЖНИКИ", words: ["РЕМБРАНДТ", "МОНЕ", "ДАЛИ", "МАЛЕВИЧ"], color: "#f9df6d" },
      { theme: "ТИПЫ КЛИМАТА", words: ["ТРОПИЧЕСКИЙ", "АРКТИЧЕСКИЙ", "УМЕРЕННЫЙ", "СУБТРОПИЧЕСКИЙ"], color: "#a0c35a" },
      { theme: "ШКОЛЫ БОЕВЫХ ИСКУССТВ", words: ["КАРАТЭ", "ДЗЮДО", "АЙКИДО", "ТХЭКВОНДО"], color: "#b0c4ef" },
      { theme: "МУЗЫКАЛЬНЫЕ ТЕРМИНЫ", words: ["ФОРТЕ", "ПИАНО", "ЛЕГАТО", "СТАККАТО"], color: "#ba81c5" }
    ]
  },

  // Week 7
  {
    difficulty: "hard",
    categories: [
      { theme: "ПСИХОЛОГИЯ", words: ["ЭМПАТИЯ", "ИНТРОВЕРТ", "КОГНИТИВ", "АФФЕКТ"], color: "#f9df6d" },
      { theme: "ТИПЫ ПОЧВ", words: ["ЧЕРНОЗЁМ", "ПОДЗОЛ", "ГЛИНА", "СУГЛИНОК"], color: "#a0c35a" },
      { theme: "ЛИТЕРАТУРНЫЕ ЖАНРЫ", words: ["НОВЕЛЛА", "ЭПОПЕЯ", "ПРИТЧА", "БАЛЛАДА"], color: "#b0c4ef" },
      { theme: "МАТЕМАТИЧЕСКИЕ ОПЕРАЦИИ", words: ["СЛОЖЕНИЕ", "ДЕЛЕНИЕ", "КОРЕНЬ", "СТЕПЕНЬ"], color: "#ba81c5" }
    ]
  },

  // Week 8
  {
    difficulty: "expert",
    categories: [
      { theme: "ЛИНГВИСТИКА", words: ["ФОНЕМА", "МОРФЕМА", "ЛЕКСЕМА", "СИНТАКСИС"], color: "#f9df6d" },
      { theme: "ЭКОНОМИЧЕСКИЕ ТЕРМИНЫ", words: ["ИНФЛЯЦИЯ", "ДЕФЛЯЦИЯ", "ДЕВАЛЬВАЦИЯ", "СТАГНАЦИЯ"], color: "#a0c35a" },
      { theme: "ТИПЫ ГОСУДАРСТВ", words: ["МОНАРХИЯ", "РЕСПУБЛИКА", "ФЕДЕРАЦИЯ", "ИМПЕРИЯ"], color: "#b0c4ef" },
      { theme: "ФИЛОСОФЫ НОВОГО ВРЕМЕНИ", words: ["ДЕКАРТ", "ЛОКК", "СПИНОЗА", "ЛЕЙБНИЦ"], color: "#ba81c5" }
    ]
  },

  // Week 9
  {
    difficulty: "hard",
    categories: [
      { theme: "ДРАГОЦЕННЫЕ КАМНИ", words: ["АЛМАЗ", "РУБИН", "САПФИР", "ИЗУМРУД"], color: "#f9df6d" },
      { theme: "МИРОВЫЕ РЕЛИГИИ", words: ["ХРИСТИАНСТВО", "ИСЛАМ", "БУДДИЗМ", "ИНДУИЗМ"], color: "#a0c35a" },
      { theme: "ТИПЫ ЭЛЕКТРОСТАНЦИЙ", words: ["ТЭС", "ГЭС", "АЭС", "СЭС"], color: "#b0c4ef" },
      { theme: "ВИДЫ ПАМЯТИ", words: ["КРАТКОВРЕМЕННАЯ", "ДОЛГОВРЕМЕННАЯ", "ОПЕРАТИВНАЯ", "СЕНСОРНАЯ"], color: "#ba81c5" }
    ]
  },

  // Week 10
  {
    difficulty: "expert",
    categories: [
      { theme: "ЛОГИЧЕСКИЕ ПАРАДОКСЫ", words: ["ЛЖЕЦ", "АХИЛЛЕС", "ВОРОН", "БРАДОБРЕЙ"], color: "#f9df6d" },
      { theme: "ВИДЫ СИММЕТРИИ", words: ["ОСЕВАЯ", "ЦЕНТРАЛЬНАЯ", "ЗЕРКАЛЬНАЯ", "ПОВОРОТНАЯ"], color: "#a0c35a" },
      { theme: "ТИПЫ ТЕМПЕРАМЕНТА", words: ["ХОЛЕРИК", "САНГВИНИК", "МЕЛАНХОЛИК", "ФЛЕГМАТИК"], color: "#b0c4ef" },
      { theme: "ОПТИЧЕСКИЕ ЯВЛЕНИЯ", words: ["МИРАЖ", "РАДУГА", "ГАЛО", "РЕФРАКЦИЯ"], color: "#ba81c5" }
    ]
  },

  // Week 11
  {
    difficulty: "hard",
    categories: [
      { theme: "ЭКОСИСТЕМЫ", words: ["ТУНДРА", "ТАЙГА", "СТЕПЬ", "САВАННА"], color: "#f9df6d" },
      { theme: "ТИПЫ ВУЛКАНОВ", words: ["ЩИТОВОЙ", "СТРАТОВУЛКАН", "КАЛЬДЕРА", "КОНУСНЫЙ"], color: "#a0c35a" },
      { theme: "ВИДЫ ЭНЕРГИИ", words: ["КИНЕТИЧЕСКАЯ", "ПОТЕНЦИАЛЬНАЯ", "ТЕПЛОВАЯ", "ЯДЕРНАЯ"], color: "#b0c4ef" },
      { theme: "АНТИЧНЫЕ ФИЛОСОФЫ", words: ["ДИОГЕН", "ПИФАГОР", "ГЕРАКЛИТ", "ДЕМОКРИТ"], color: "#ba81c5" }
    ]
  },

  // Week 12
  {
    difficulty: "expert",
    categories: [
      { theme: "КОГНИТИВНЫЕ ИСКАЖЕНИЯ", words: ["ЭВРИСТИКА", "КОНФОРМИЗМ", "ЯКОРЕНИЕ", "ФРЕЙМИНГ"], color: "#f9df6d" },
      { theme: "МАТЕМАТИЧЕСКИЕ КОНЦЕПЦИИ", words: ["ФРАКТАЛ", "МНОЖЕСТВО", "ПРЕДЕЛ", "ИНТЕГРАЛ"], color: "#a0c35a" },
      { theme: "ВИДЫ МУТАЦИЙ", words: ["ГЕННАЯ", "ХРОМОСОМНАЯ", "ГЕНОМНАЯ", "ТОЧЕЧНАЯ"], color: "#b0c4ef" },
      { theme: "ФОРМЫ ПРАВЛЕНИЯ", words: ["ДЕСПОТИЯ", "ОЛИГАРХИЯ", "ТИМОКРАТИЯ", "ОХЛОКРАТИЯ"], color: "#ba81c5" }
    ]
  },

  // Week 13
  {
    difficulty: "hard",
    categories: [
      { theme: "ЖАНРЫ ЖИВОПИСИ", words: ["ПОРТРЕТ", "ПЕЙЗАЖ", "НАТЮРМОРТ", "МАРИНА"], color: "#f9df6d" },
      { theme: "КОМПОНЕНТЫ КРОВИ", words: ["ЭРИТРОЦИТЫ", "ЛЕЙКОЦИТЫ", "ТРОМБОЦИТЫ", "ПЛАЗМА"], color: "#a0c35a" },
      { theme: "ОРКЕСТРОВЫЕ ГРУППЫ", words: ["СТРУННЫЕ", "ДУХОВЫЕ", "УДАРНЫЕ", "МЕДНЫЕ"], color: "#b0c4ef" },
      { theme: "ТИПЫ ИЗЛУЧЕНИЯ", words: ["АЛЬФА", "БЕТА", "ГАММА", "РЕНТГЕН"], color: "#ba81c5" }
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
 * Mark weekly puzzle as completed.
 */
function completeWeeklyPuzzle(stars) {
    save.weeklyPuzzleWeekId = getWeekId();
    save.weeklyPuzzleCompleted = true;
    save.weeklyPuzzleStars = stars;
    save.weeklyPuzzlesTotal = (save.weeklyPuzzlesTotal || 0) + 1;
    writeSave(save);
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
