/**
 * dailypuzzlewords.js — Daily puzzle pool
 *
 * Each day a puzzle is selected from this pool using a date-based seed.
 * These are "easy/medium" puzzles designed for broad daily engagement.
 */
const DAILY_PUZZLES = [

  // Day 1
  {
    difficulty: "easy",
    categories: [
      { theme: "НАПИТКИ", words: ["ЧАЙ", "КОФЕ", "СОКА", "КАКАО"], color: "#f9df6d" },
      { theme: "ПЛАНЕТЫ", words: ["МАРС", "ЗЕМЛЯ", "ВЕНЕРА", "ЮПИТЕР"], color: "#a0c35a" },
      { theme: "МУЗЫКА", words: ["ГИТАРА", "БАРАБАН", "СКРИПКА", "ФЛЕЙТА"], color: "#b0c4ef" },
      { theme: "ОДЕЖДА", words: ["ШАПКА", "КУРТКА", "ШАРФ", "ПЕРЧАТКИ"], color: "#ba81c5" }
    ]
  },

  // Day 2
  {
    difficulty: "easy",
    categories: [
      { theme: "ЯГОДЫ", words: ["МАЛИНА", "КЛУБНИКА", "ЧЕРНИКА", "ВИШНЯ"], color: "#f9df6d" },
      { theme: "СПОРТ", words: ["ФУТБОЛ", "ХОККЕЙ", "ТЕННИС", "БОКС"], color: "#a0c35a" },
      { theme: "МЕБЕЛЬ", words: ["СТОЛ", "СТУЛ", "ДИВАН", "КРОВАТЬ"], color: "#b0c4ef" },
      { theme: "ПОГОДА", words: ["ДОЖДЬ", "СНЕГ", "ВЕТЕР", "ТУМАН"], color: "#ba81c5" }
    ]
  },

  // Day 3
  {
    difficulty: "easy",
    categories: [
      { theme: "ДЕРЕВЬЯ", words: ["БЕРЁЗА", "ДУБ", "СОСНА", "ЕЛЬ"], color: "#f9df6d" },
      { theme: "РЫБЫ", words: ["СЕЛЬДЬ", "ЛОСОСЬ", "КАРАСЬ", "ЩУКА"], color: "#a0c35a" },
      { theme: "СТОЛИЦЫ", words: ["МОСКВА", "ПАРИЖ", "ЛОНДОН", "ТОКИО"], color: "#b0c4ef" },
      { theme: "ЭМОЦИИ", words: ["РАДОСТЬ", "ГРУСТЬ", "СТРАХ", "ГНЕВ"], color: "#ba81c5" }
    ]
  },

  // Day 4
  {
    difficulty: "medium",
    categories: [
      { theme: "ПТИЦЫ", words: ["ВОРОНА", "ГОЛУБЬ", "СИНИЦА", "СОКОЛ"], color: "#f9df6d" },
      { theme: "МЕТАЛЛЫ", words: ["ЗОЛОТО", "СЕРЕБРО", "МЕДЬ", "ЖЕЛЕЗО"], color: "#a0c35a" },
      { theme: "ЧУВСТВА", words: ["ЗРЕНИЕ", "СЛУХ", "ВКУС", "ОБОНЯНИЕ"], color: "#b0c4ef" },
      { theme: "ТРАНСПОРТ", words: ["ПОЕЗД", "АВТОБУС", "ТРАМВАЙ", "МЕТРО"], color: "#ba81c5" }
    ]
  },

  // Day 5
  {
    difficulty: "easy",
    categories: [
      { theme: "ОВОЩИ", words: ["МОРКОВЬ", "КАРТОШКА", "ОГУРЕЦ", "ПОМИДОР"], color: "#f9df6d" },
      { theme: "ЦВЕТЫ", words: ["РОЗА", "ТЮЛЬПАН", "РОМАШКА", "ЛИЛИЯ"], color: "#a0c35a" },
      { theme: "ШКОЛА", words: ["УЧИТЕЛЬ", "ПАРТА", "ДОСКА", "ЗВОНОК"], color: "#b0c4ef" },
      { theme: "ПОСУДА", words: ["ТАРЕЛКА", "ЧАШКА", "ЛОЖКА", "ВИЛКА"], color: "#ba81c5" }
    ]
  },

  // Day 6
  {
    difficulty: "medium",
    categories: [
      { theme: "МОРЯ", words: ["ЧЁРНОЕ", "КРАСНОЕ", "БЕЛОЕ", "ЖЁЛТОЕ"], color: "#f9df6d" },
      { theme: "КУХНЯ", words: ["ПЛИТА", "ДУХОВКА", "МОЙКА", "ХОЛОДИЛЬНИК"], color: "#a0c35a" },
      { theme: "МОНЕТЫ", words: ["РУБЛЬ", "ДОЛЛАР", "ЕВРО", "ФУНТ"], color: "#b0c4ef" },
      { theme: "ТАНЦЫ", words: ["ВАЛЬС", "ТАНГО", "САЛЬСА", "ПОЛЬКА"], color: "#ba81c5" }
    ]
  },

  // Day 7
  {
    difficulty: "easy",
    categories: [
      { theme: "НАСЕКОМЫЕ", words: ["МУРАВЕЙ", "ПЧЕЛА", "БАБОЧКА", "ЖУКОЛЁТ"], color: "#f9df6d" },
      { theme: "ИНСТРУМЕНТЫ", words: ["МОЛОТОК", "ПИЛА", "ОТВЁРТКА", "КЛЕЩИ"], color: "#a0c35a" },
      { theme: "СЛАДОСТИ", words: ["ТОРТ", "КОНФЕТА", "ПЕЧЕНЬЕ", "МОРОЖЕНОЕ"], color: "#b0c4ef" },
      { theme: "ЧАСТИ ТЕЛА", words: ["ГОЛОВА", "РУКА", "НОГА", "СПИНА"], color: "#ba81c5" }
    ]
  },

  // Day 8
  {
    difficulty: "medium",
    categories: [
      { theme: "ПРОФЕССИИ", words: ["ВРАЧ", "ПОВАР", "ПИЛОТ", "АКТЁР"], color: "#f9df6d" },
      { theme: "КОСМОС", words: ["ЗВЕЗДА", "КОМЕТА", "ЛУНА", "СПУТНИК"], color: "#a0c35a" },
      { theme: "ИГРЫ", words: ["ШАХМАТЫ", "ШАШКИ", "ЛОТО", "ДОМИНО"], color: "#b0c4ef" },
      { theme: "ЖАНРЫ КИНО", words: ["КОМЕДИЯ", "ДРАМА", "ТРИЛЛЕР", "БОЕВИК"], color: "#ba81c5" }
    ]
  },

  // Day 9
  {
    difficulty: "easy",
    categories: [
      { theme: "МЕСЯЦЫ", words: ["ЯНВАРЬ", "МАРТ", "ИЮНЬ", "ОКТЯБРЬ"], color: "#f9df6d" },
      { theme: "ДОМ", words: ["КРЫША", "СТЕНА", "ДВЕРЬ", "ОКНО"], color: "#a0c35a" },
      { theme: "ЖИВОТНЫЕ САВАННЫ", words: ["ЛЕВ", "ЖИРАФ", "ЗЕБРА", "СЛОН"], color: "#b0c4ef" },
      { theme: "ТКАНИ", words: ["ШЁЛК", "ХЛОПОК", "ЛЁН", "ШЕРСТЬ"], color: "#ba81c5" }
    ]
  },

  // Day 10
  {
    difficulty: "medium",
    categories: [
      { theme: "РЕКИ РОССИИ", words: ["ВОЛГА", "ОБЬ", "ЛЕНА", "ЕНИСЕЙ"], color: "#f9df6d" },
      { theme: "СПЕЦИИ", words: ["ПЕРЕЦ", "КОРИЦА", "ИМБИРЬ", "КУРКУМА"], color: "#a0c35a" },
      { theme: "ЖАНРЫ МУЗЫКИ", words: ["РОК", "ДЖАЗ", "БЛЮЗ", "ПОПСА"], color: "#b0c4ef" },
      { theme: "ГЕОМЕТРИЯ", words: ["КРУГ", "КВАДРАТ", "ТРЕУГОЛЬНИК", "РОМБ"], color: "#ba81c5" }
    ]
  },

  // Day 11
  {
    difficulty: "easy",
    categories: [
      { theme: "ГРИБЫ", words: ["БЕЛЫЙ", "ЛИСИЧКА", "ОПЁНОК", "МАСЛЁНОК"], color: "#f9df6d" },
      { theme: "МАТЕРИКИ", words: ["АФРИКА", "ЕВРОПА", "АЗИЯ", "АМЕРИКА"], color: "#a0c35a" },
      { theme: "ЗНАКИ ЗОДИАКА", words: ["ОВЕН", "ТЕЛЕЦ", "БЛИЗНЕЦЫ", "РЫБЫ"], color: "#b0c4ef" },
      { theme: "ПРАЗДНИКИ", words: ["НОВЫЙ ГОД", "ПАСХА", "8 МАРТА", "ДЕНЬ ПОБЕДЫ"], color: "#ba81c5" }
    ]
  },

  // Day 12
  {
    difficulty: "medium",
    categories: [
      { theme: "ПИСАТЕЛИ", words: ["ПУШКИН", "ТОЛСТОЙ", "ЧЕХОВ", "ГОГОЛЬ"], color: "#f9df6d" },
      { theme: "НОТЫ", words: ["ДО", "РЕ", "МИ", "СОЛЬ"], color: "#a0c35a" },
      { theme: "СТИХИИ", words: ["ОГОНЬ", "ВОДА", "ЗЕМЛЯ", "ВОЗДУХ"], color: "#b0c4ef" },
      { theme: "УКРАШЕНИЯ", words: ["КОЛЬЦО", "СЕРЬГИ", "БРАСЛЕТ", "ЦЕПОЧКА"], color: "#ba81c5" }
    ]
  },

  // Day 13
  {
    difficulty: "easy",
    categories: [
      { theme: "ВРЕМЕНА СУТОК", words: ["УТРО", "ДЕНЬ", "ВЕЧЕР", "НОЧЬ"], color: "#f9df6d" },
      { theme: "МОРСКИЕ ЖИВОТНЫЕ", words: ["ДЕЛЬФИН", "АКУЛА", "ОСЬМИНОГ", "КРАБ"], color: "#a0c35a" },
      { theme: "ОБУВЬ", words: ["КРОССОВКИ", "САПОГИ", "ТУФЛИ", "ТАПОЧКИ"], color: "#b0c4ef" },
      { theme: "КАШИ", words: ["ГРЕЧКА", "ОВСЯНКА", "РИС", "МАНКА"], color: "#ba81c5" }
    ]
  },

  // Day 14
  {
    difficulty: "medium",
    categories: [
      { theme: "ШАХМАТЫ", words: ["КОРОЛЬ", "ФЕРЗЬ", "ЛАДЬЯ", "КОНЬ"], color: "#f9df6d" },
      { theme: "МАТЕРИАЛЫ", words: ["ДЕРЕВО", "КАМЕНЬ", "СТЕКЛО", "ПЛАСТИК"], color: "#a0c35a" },
      { theme: "НАУКИ", words: ["ФИЗИКА", "ХИМИЯ", "БИОЛОГИЯ", "ИСТОРИЯ"], color: "#b0c4ef" },
      { theme: "СКАЗКИ", words: ["КОЛОБОК", "ТЕРЕМОК", "РЕПКА", "КУРОЧКА РЯБА"], color: "#ba81c5" }
    ]
  },

  // Day 15
  {
    difficulty: "easy",
    categories: [
      { theme: "ЦВЕТА РАДУГИ", words: ["КРАСНЫЙ", "ОРАНЖЕВЫЙ", "ГОЛУБОЙ", "ФИОЛЕТОВЫЙ"], color: "#f9df6d" },
      { theme: "МОЛОЧНЫЕ ПРОДУКТЫ", words: ["МОЛОКО", "КЕФИР", "СМЕТАНА", "ТВОРОГ"], color: "#a0c35a" },
      { theme: "ВИДЫ СПОРТА НА ВОДЕ", words: ["ПЛАВАНИЕ", "ДАЙВИНГ", "СЁРФИНГ", "ГРЕБЛЯ"], color: "#b0c4ef" },
      { theme: "КОМНАТЫ", words: ["КУХНЯ", "СПАЛЬНЯ", "ВАННАЯ", "ГОСТИНАЯ"], color: "#ba81c5" }
    ]
  },

  // Day 16
  {
    difficulty: "medium",
    categories: [
      { theme: "ГОРЫ", words: ["ЭЛЬБРУС", "ЭВЕРЕСТ", "АЛЬПЫ", "УРАЛ"], color: "#f9df6d" },
      { theme: "ПРИПРАВЫ", words: ["СОЛЬ", "САХАР", "УКСУС", "ГОРЧИЦА"], color: "#a0c35a" },
      { theme: "КИНОРЕЖИССЁРЫ", words: ["ТАРКОВСКИЙ", "СПИЛБЕРГ", "НОЛАН", "КУБРИК"], color: "#b0c4ef" },
      { theme: "КАРТОЧНЫЕ МАСТИ", words: ["ПИКИ", "ЧЕРВЫ", "БУБНЫ", "ТРЕФЫ"], color: "#ba81c5" }
    ]
  },

  // Day 17
  {
    difficulty: "easy",
    categories: [
      { theme: "ФРУКТЫ ТРОПИКОВ", words: ["АНАНАС", "МАНГО", "ПАПАЙЯ", "КОКОС"], color: "#f9df6d" },
      { theme: "ПОСУДА ДЛЯ НАПИТКОВ", words: ["СТАКАН", "КРУЖКА", "БОКАЛ", "РЮМКА"], color: "#a0c35a" },
      { theme: "ПОРОДЫ СОБАК", words: ["ЛАБРАДОР", "ОВЧАРКА", "БУЛЬДОГ", "ХАСКИ"], color: "#b0c4ef" },
      { theme: "ЕДА НА ЗАВТРАК", words: ["ЯИЧНИЦА", "БЛИНЫ", "КАША", "ТОСТ"], color: "#ba81c5" }
    ]
  },

  // Day 18
  {
    difficulty: "medium",
    categories: [
      { theme: "ЯЗЫКИ", words: ["РУССКИЙ", "АНГЛИЙСКИЙ", "ЯПОНСКИЙ", "ИСПАНСКИЙ"], color: "#f9df6d" },
      { theme: "МУЗЫКАЛЬНЫЕ ГРУППЫ", words: ["БИТЛЗ", "КИНО", "НИРВАНА", "КВИН"], color: "#a0c35a" },
      { theme: "ВИДЫ ТРАНСПОРТА", words: ["САМОЛЁТ", "КОРАБЛЬ", "ВЕРТОЛЁТ", "ПОДЛОДКА"], color: "#b0c4ef" },
      { theme: "МИФИЧЕСКИЕ СУЩЕСТВА", words: ["ДРАКОН", "ЕДИНОРОГ", "ФЕНИКС", "ГРИФОН"], color: "#ba81c5" }
    ]
  },

  // Day 19
  {
    difficulty: "easy",
    categories: [
      { theme: "ЗИМНИЕ ЗАБАВЫ", words: ["САНКИ", "ЛЫЖИ", "КОНЬКИ", "СНЕГОВИК"], color: "#f9df6d" },
      { theme: "КАНЦЕЛЯРИЯ", words: ["РУЧКА", "КАРАНДАШ", "ЛАСТИК", "ЛИНЕЙКА"], color: "#a0c35a" },
      { theme: "СУПЫ", words: ["БОРЩ", "ЩИ", "СОЛЯНКА", "ОКРОШКА"], color: "#b0c4ef" },
      { theme: "ПРИРОДНЫЕ ЯВЛЕНИЯ", words: ["ГРОЗА", "РАДУГА", "ЗАКАТ", "РАССВЕТ"], color: "#ba81c5" }
    ]
  },

  // Day 20
  {
    difficulty: "medium",
    categories: [
      { theme: "ОЗЁРА", words: ["БАЙКАЛ", "ОНЕЖСКОЕ", "ЛАДОЖСКОЕ", "КАСПИЙ"], color: "#f9df6d" },
      { theme: "ПРЯНОСТИ ВОСТОКА", words: ["ШАФРАН", "КАРДАМОН", "БАДЬЯН", "ГВОЗДИКА"], color: "#a0c35a" },
      { theme: "ВИДЫ СВЯЗИ", words: ["ТЕЛЕФОН", "ПОЧТА", "ТЕЛЕГРАФ", "РАДИО"], color: "#b0c4ef" },
      { theme: "КАРТЫ", words: ["ТУЗ", "ВАЛЕТ", "ДАМА", "ДЖОКЕР"], color: "#ba81c5" }
    ]
  },

  // Day 21
  {
    difficulty: "easy",
    categories: [
      { theme: "ВЫПЕЧКА", words: ["ХЛЕБ", "БУЛОЧКА", "КРУАССАН", "ПИРОЖОК"], color: "#f9df6d" },
      { theme: "ДОМАШНИЕ ПТИЦЫ", words: ["КУРИЦА", "ГУСЬ", "УТКА", "ИНДЕЙКА"], color: "#a0c35a" },
      { theme: "ВИДЫ ОБУВИ", words: ["БОТИНКИ", "САНДАЛИИ", "ВАЛЕНКИ", "МОКАСИНЫ"], color: "#b0c4ef" },
      { theme: "КОМНАТНЫЕ РАСТЕНИЯ", words: ["ФИКУС", "КАКТУС", "АЛОЭ", "ГЕРАНЬ"], color: "#ba81c5" }
    ]
  },

  // Day 22
  {
    difficulty: "medium",
    categories: [
      { theme: "ЕДИНИЦЫ ИЗМЕРЕНИЯ", words: ["МЕТР", "ЛИТР", "КИЛОГРАММ", "СЕКУНДА"], color: "#f9df6d" },
      { theme: "ВИДЫ ИСКУССТВА", words: ["ЖИВОПИСЬ", "СКУЛЬПТУРА", "АРХИТЕКТУРА", "ГРАФИКА"], color: "#a0c35a" },
      { theme: "ПОРОДЫ КОШЕК", words: ["СИАМСКАЯ", "ПЕРСИДСКАЯ", "СФИНКС", "МЕЙНКУН"], color: "#b0c4ef" },
      { theme: "ВИДЫ ОБЛАКОВ", words: ["КУЧЕВЫЕ", "ПЕРИСТЫЕ", "СЛОИСТЫЕ", "ГРОЗОВЫЕ"], color: "#ba81c5" }
    ]
  },

  // Day 23
  {
    difficulty: "easy",
    categories: [
      { theme: "ЧИСЛА", words: ["ОДИН", "ДВА", "ТРИ", "ЧЕТЫРЕ"], color: "#f9df6d" },
      { theme: "ЕДА БЫСТРАЯ", words: ["ПИЦЦА", "БУРГЕР", "ХОТДОГ", "ШАУРМА"], color: "#a0c35a" },
      { theme: "ВЕЩИ В СУМКЕ", words: ["КЛЮЧИ", "КОШЕЛЁК", "ТЕЛЕФОН", "НАУШНИКИ"], color: "#b0c4ef" },
      { theme: "ВИДЫ СПОРТА НА ЛЬДУ", words: ["ХОККЕЙ", "КЁРЛИНГ", "ФИГУРНОЕ КАТАНИЕ", "ШОРТ-ТРЕК"], color: "#ba81c5" }
    ]
  },

  // Day 24
  {
    difficulty: "medium",
    categories: [
      { theme: "РУССКИЕ ЦАРИ", words: ["ПЁТР", "ИВАН", "НИКОЛАЙ", "АЛЕКСАНДР"], color: "#f9df6d" },
      { theme: "ВИДЫ ЧАЯ", words: ["ЗЕЛЁНЫЙ", "ЧЁРНЫЙ", "БЕЛЫЙ", "УЛУН"], color: "#a0c35a" },
      { theme: "АСТРОНОМИЯ", words: ["СОЗВЕЗДИЕ", "ГАЛАКТИКА", "ТУМАННОСТЬ", "КВАЗАР"], color: "#b0c4ef" },
      { theme: "СТРОИТЕЛЬСТВО", words: ["КИРПИЧ", "ЦЕМЕНТ", "БЕТОН", "АРМАТУРА"], color: "#ba81c5" }
    ]
  },

  // Day 25
  {
    difficulty: "easy",
    categories: [
      { theme: "БЫТОВАЯ ТЕХНИКА", words: ["ЧАЙНИК", "ПЫЛЕСОС", "УТЮГ", "ФЕН"], color: "#f9df6d" },
      { theme: "ВИДЫ ХЛЕБА", words: ["БАТОН", "БОРОДИНСКИЙ", "ЛАВАШ", "БАГЕТ"], color: "#a0c35a" },
      { theme: "МАГАЗИНЫ", words: ["АПТЕКА", "ПЕКАРНЯ", "КНИЖНЫЙ", "ЗООМАГАЗИН"], color: "#b0c4ef" },
      { theme: "ПРЕДМЕТЫ В КЛАССЕ", words: ["ПАРТА", "МЕЛЬ", "ГЛОБУС", "КАРТА"], color: "#ba81c5" }
    ]
  },

  // Day 26
  {
    difficulty: "medium",
    categories: [
      { theme: "МУЛЬТФИЛЬМЫ", words: ["МАША", "ЛУНТИК", "ФИКСИКИ", "СМЕШАРИКИ"], color: "#f9df6d" },
      { theme: "МУЗЫКА ОРКЕСТРА", words: ["ВИОЛОНЧЕЛЬ", "ТРУБА", "АРФА", "ФАГОТ"], color: "#a0c35a" },
      { theme: "ВИДЫ ТАНЦА", words: ["БАЛЕТ", "ХИП-ХОП", "ФЛАМЕНКО", "БРЕЙК"], color: "#b0c4ef" },
      { theme: "ДРЕВНИЕ ЦИВИЛИЗАЦИИ", words: ["ЕГИПЕТ", "РИМ", "ГРЕЦИЯ", "КИТАЙ"], color: "#ba81c5" }
    ]
  },

  // Day 27
  {
    difficulty: "easy",
    categories: [
      { theme: "СЫРЫ", words: ["МОЦАРЕЛЛА", "ПАРМЕЗАН", "БРИЁ", "ЧЕДДЕР"], color: "#f9df6d" },
      { theme: "ВИДЫ ГОЛОВНЫХ УБОРОВ", words: ["КЕПКА", "БЕРЕТ", "ПАНАМА", "УШАНКА"], color: "#a0c35a" },
      { theme: "ДЕТСКИЕ ИГРУШКИ", words: ["КУКЛА", "МЯЧА", "КУБИКИ", "ЮЛА"], color: "#b0c4ef" },
      { theme: "ПРЕДМЕТЫ ГИГИЕНЫ", words: ["МЫЛО", "ЗУБНАЯ ЩЁТКА", "ШАМПУНЬ", "ПОЛОТЕНЦЕ"], color: "#ba81c5" }
    ]
  },

  // Day 28
  {
    difficulty: "medium",
    categories: [
      { theme: "ВИДЫ КОФЕ", words: ["ЛАТТЕ", "КАПУЧИНО", "ЭСПРЕССО", "АМЕРИКАНО"], color: "#f9df6d" },
      { theme: "ГОРНЫЕ ПОРОДЫ", words: ["ГРАНИТ", "МРАМОР", "БАЗАЛЬТ", "СЛАНЕЦ"], color: "#a0c35a" },
      { theme: "КОМПЬЮТЕР", words: ["КЛАВИАТУРА", "МОНИТОР", "МЫШКА", "ПРОЦЕССОР"], color: "#b0c4ef" },
      { theme: "ВИДЫ РИФМ", words: ["ПАРНАЯ", "ПЕРЕКРЁСТНАЯ", "КОЛЬЦЕВАЯ", "ХОЛОСТАЯ"], color: "#ba81c5" }
    ]
  },

  // Day 29
  {
    difficulty: "easy",
    categories: [
      { theme: "ФЕРМЕРСКИЕ ЖИВОТНЫЕ", words: ["КОРОВА", "СВИНЬЯ", "КОЗА", "ОВЦА"], color: "#f9df6d" },
      { theme: "САДОВЫЕ ЯГОДЫ", words: ["КРЫЖОВНИК", "СМОРОДИНА", "ЕЖЕВИКА", "ОБЛЕПИХА"], color: "#a0c35a" },
      { theme: "ВИДЫ СУМОК", words: ["РЮКЗАК", "ПОРТФЕЛЬ", "КЛАТЧ", "ЧЕМОДАН"], color: "#b0c4ef" },
      { theme: "ПРЕДМЕТЫ НА СТОЛЕ", words: ["ЛАМПА", "ТЕТРАДЬ", "СТЕПЛЕР", "СКРЕПКИ"], color: "#ba81c5" }
    ]
  },

  // Day 30
  {
    difficulty: "medium",
    categories: [
      { theme: "ФИЛОСОФЫ", words: ["ПЛАТОН", "АРИСТОТЕЛЬ", "СОКРАТ", "КАНТ"], color: "#f9df6d" },
      { theme: "ВИДЫ ОТДЫХА", words: ["ПОХОД", "РЫБАЛКА", "ПИКНИК", "БАНЯ"], color: "#a0c35a" },
      { theme: "ВАЛЮТЫ", words: ["ЮАНЬ", "ИЕНА", "РУПИЯ", "КРОНА"], color: "#b0c4ef" },
      { theme: "ПОГОДНЫЕ ПРИБОРЫ", words: ["БАРОМЕТР", "ТЕРМОМЕТР", "ФЛЮГЕР", "ГИГРОМЕТР"], color: "#ba81c5" }
    ]
  },

  // Day 31
  {
    difficulty: "easy",
    categories: [
      { theme: "ВСЁ КРУГЛОЕ", words: ["МЯЧ", "СОЛНЦЕ", "МОНЕТА", "КОЛЕСО"], color: "#f9df6d" },
      { theme: "ПИЦЦА", words: ["МАРГАРИТА", "ПЕППЕРОНИ", "ГАВАЙСКАЯ", "ЧЕТЫРЕ СЫРА"], color: "#a0c35a" },
      { theme: "ДЕТЁНЫШИ", words: ["КОТЁНОК", "ЩЕНОК", "ЦЫПЛЁНОК", "ТЕЛЁНОК"], color: "#b0c4ef" },
      { theme: "КУХОННАЯ УТВАРЬ", words: ["СКОВОРОДА", "КАСТРЮЛЯ", "ДУРШЛАГ", "СКАЛКА"], color: "#ba81c5" }
    ]
  }

];

// =============================================
// DAILY PUZZLE SELECTION
// =============================================

/**
 * Get today's daily puzzle using date-based seed.
 * Returns null if already completed today.
 */
function getDailyPuzzle() {
    const today = getToday();
    const seed = dateSeed('daily_' + today);
    const idx = seed % DAILY_PUZZLES.length;
    return { puzzle: DAILY_PUZZLES[idx], index: idx, date: today };
}

/**
 * Check if today's daily puzzle is completed.
 */
function isDailyPuzzleCompleted() {
    const today = getToday();
    return save.dailyPuzzleDate === today && save.dailyPuzzleCompleted;
}

/**
 * Mark daily puzzle as completed.
 */
function completeDailyPuzzle(stars) {
    save.dailyPuzzleDate = getToday();
    save.dailyPuzzleCompleted = true;
    save.dailyPuzzleStars = stars;
    save.dailyPuzzlesTotal = (save.dailyPuzzlesTotal || 0) + 1;
    writeSave(save);
}

/**
 * Launch today's daily puzzle.
 */
let isDailyPuzzleMode = false;

function launchDailyPuzzle() {
    if (isDailyPuzzleCompleted()) {
        showToast('&#10003;', 'Ежедневный паззл уже пройден!');
        return;
    }

    const daily = getDailyPuzzle();
    isDailyPuzzleMode = true;

    // Override puzzle selection
    puzzle = daily.puzzle;
    difficulty = daily.puzzle.difficulty;
    puzzleIndex = daily.index;
    isEndless = false;
    maxMist = DIFF_META[difficulty].attempts;
    initRound();
}
