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
 // --- Новые easy паззлы ---
  {
    difficulty: "easy",
    categories: [
      { theme: "ГРИБЫ", words: ["ЛИСИЧКА", "ПОДБЕРЁЗОВИК", "ШАМПИНЬОН", "ОПЁНОК"], color: "#f9df6d" },
      { theme: "МОРСКИЕ ЖИВОТНЫЕ", words: ["ДЕЛЬФИН", "АКУЛА", "ОСЬМИНОГ", "МЕДУЗА"], color: "#a0c35a" },
      { theme: "КРУПЫ", words: ["РИС", "ГРЕЧКА", "ПШЕНО", "ОВСЯНКА"], color: "#b0c4ef" },
      { theme: "ГОЛОВНЫЕ УБОРЫ", words: ["КЕПКА", "ПАНАМА", "БЕРЕТ", "ШЛЯПА"], color: "#ba81c5" }
    ]
  },
  {
    difficulty: "easy",
    categories: [
      { theme: "СПЕЦИИ", words: ["СОЛЬ", "ПЕРЕЦ", "КОРИЦА", "ВАНИЛЬ"], color: "#f9df6d" },
      { theme: "ВОДНЫЙ ТРАНСПОРТ", words: ["ЛОДКА", "ЯХТА", "КАТЕР", "ПАРОМ"], color: "#a0c35a" },
      { theme: "КАНЦЕЛЯРИЯ", words: ["РУЧКА", "КАРАНДАШ", "ЛАСТИК", "ЛИНЕЙКА"], color: "#b0c4ef" },
      { theme: "КОМНАТЫ В ДОМЕ", words: ["КУХНЯ", "СПАЛЬНЯ", "ВАННАЯ", "ГОСТИНАЯ"], color: "#ba81c5" }
    ]
  },
  {
    difficulty: "easy",
    categories: [
      { theme: "ДИКИЕ ЖИВОТНЫЕ", words: ["ВОЛК", "МЕДВЕДЬ", "ЛИСА", "ЗАЯЦ"], color: "#f9df6d" },
      { theme: "ЭЛЕКТРОНИКА", words: ["ТЕЛЕФОН", "ПЛАНШЕТ", "НОУТБУК", "ТЕЛЕВИЗОР"], color: "#a0c35a" },
      { theme: "ВЫПЕЧКА", words: ["ХЛЕБ", "БУЛКА", "ПИРОГ", "БАТОН"], color: "#b0c4ef" },
      { theme: "СТОЛОВЫЕ ПРИБОРЫ", words: ["НОЖ", "ВИЛКА", "ЛОЖКА", "ПОЛОВНИК"], color: "#ba81c5" }
    ]
  },
  {
    difficulty: "easy",
    categories: [
      { theme: "ОБУВЬ", words: ["КРОССОВКИ", "БОТИНКИ", "ТАПОЧКИ", "ВАЛЕНКИ"], color: "#f9df6d" },
      { theme: "ОРЕХИ", words: ["ГРЕЦКИЙ", "ФУНДУК", "МИНДАЛЬ", "КЕШЬЮ"], color: "#a0c35a" },
      { theme: "БЫТОВАЯ ТЕХНИКА", words: ["ХОЛОДИЛЬНИК", "СТИРАЛЬНАЯ", "ПЫЛЕСОС", "МИКРОВОЛНОВКА"], color: "#b0c4ef" },
      { theme: "ПРАЗДНИКИ", words: ["НОВЫЙ ГОД", "ПАСХА", "МАСЛЕНИЦА", "РОЖДЕСТВО"], color: "#ba81c5" }
    ]
  },
  {
    difficulty: "easy",
    categories: [
      { theme: "НАСТОЛЬНЫЕ ИГРЫ", words: ["ШАШКИ", "ШАХМАТЫ", "НАРДЫ", "ДОМИНО"], color: "#f9df6d" },
      { theme: "ЗИМНИЙ СПОРТ", words: ["ЛЫЖИ", "КОНЬКИ", "СНОУБОРД", "САНКИ"], color: "#a0c35a" },
      { theme: "СУПЫ", words: ["БОРЩ", "СОЛЯНКА", "ЩИ", "ОКРОШКА"], color: "#b0c4ef" },
      { theme: "ЗНАКИ ЗОДИАКА", words: ["ОВЕН", "ТЕЛЕЦ", "БЛИЗНЕЦЫ", "СКОРПИОН"], color: "#ba81c5" }
    ]
  },
  {
    difficulty: "easy",
    categories: [
      { theme: "ДРАГОЦЕННОСТИ", words: ["КОЛЬЦО", "СЕРЬГИ", "БРАСЛЕТ", "ОЖЕРЕЛЬЕ"], color: "#f9df6d" },
      { theme: "ПУСТЫННЫЕ ЖИВОТНЫЕ", words: ["ВЕРБЛЮД", "СКОРПИОН", "ВАРАН", "СУРИКАТ"], color: "#a0c35a" },
      { theme: "МУЗЫКАЛЬНЫЕ ЖАНРЫ", words: ["ПОП", "РОК", "ДЖАЗ", "КЛАССИКА"], color: "#b0c4ef" },
      { theme: "ВИДЫ СУМОК", words: ["РЮКЗАК", "ПОРТФЕЛЬ", "ЧЕМОДАН", "ПАКЕТ"], color: "#ba81c5" }
    ]
  },
  {
    difficulty: "easy",
    categories: [
      { theme: "ОВОЩИ НА ГРЯДКЕ", words: ["КАБАЧОК", "ТЫКВА", "БАКЛАЖАН", "РЕДИС"], color: "#f9df6d" },
      { theme: "ЗООПАРК", words: ["ЖИРАФ", "СЛОН", "ЗЕБРА", "НОСОРОГ"], color: "#a0c35a" },
      { theme: "КНИЖНЫЕ ЖАНРЫ", words: ["СКАЗКА", "РОМАН", "ПОВЕСТЬ", "РАССКАЗ"], color: "#b0c4ef" },
      { theme: "КУХОННАЯ УТВАРЬ", words: ["СКОВОРОДА", "КАСТРЮЛЯ", "ДУРШЛАГ", "СКАЛКА"], color: "#ba81c5" }
    ]
  },
  {
    difficulty: "easy",
    categories: [
      { theme: "ЗЕРНОВЫЕ", words: ["ПШЕНИЦА", "РОЖЬ", "ЯЧМЕНЬ", "КУКУРУЗА"], color: "#f9df6d" },
      { theme: "ТКАНИ", words: ["ХЛОПОК", "ШЁЛК", "БАРХАТ", "ДЖИНСА"], color: "#a0c35a" },
      { theme: "ПРИРОДНЫЕ ЯВЛЕНИЯ", words: ["РАДУГА", "МОЛНИЯ", "ТУМАН", "РОСА"], color: "#b0c4ef" },
      { theme: "ДЕТСКИЕ ИГРУШКИ", words: ["КУКЛА", "МЯЧИК", "ПИРАМИДКА", "ЮЛА"], color: "#ba81c5" }
    ]
  },
  {
    difficulty: "easy",
    categories: [
      { theme: "ЭКЗОТИЧЕСКИЕ ФРУКТЫ", words: ["МАНГО", "АНАНАС", "КОКОС", "КИВИ"], color: "#f9df6d" },
      { theme: "РЕЧНЫЕ РЫБЫ", words: ["САЗАН", "СОМ", "ЛЕЩ", "СУДАК"], color: "#a0c35a" },
      { theme: "ТИПЫ ТРАНСПОРТА", words: ["ТРАМВАЙ", "МЕТРО", "ТРОЛЛЕЙБУС", "ТАКСИ"], color: "#b0c4ef" },
      { theme: "ДОМАШНИЕ ДЕЛА", words: ["УБОРКА", "СТИРКА", "ГОТОВКА", "ГЛАЖКА"], color: "#ba81c5" }
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
 // --- Новые medium паззлы ---
  {
    difficulty: "medium",
    categories: [
      { theme: "ПОРОДЫ КОШЕК", words: ["СИАМСКАЯ", "ПЕРСИДСКАЯ", "СФИНКС", "МЕЙН-КУН"], color: "#f9df6d" },
      { theme: "БОЕВЫЕ ИСКУССТВА", words: ["КАРАТЕ", "ДЗЮДО", "ТХЭКВОНДО", "АЙКИДО"], color: "#a0c35a" },
      { theme: "ВИДЫ ТРАНСПОРТА", words: ["МОНОРЕЛЬС", "ФУНИКУЛЁР", "ДИРИЖАБЛЬ", "СЕГВЕЙ"], color: "#b0c4ef" },
      { theme: "ВИДЫ КОФЕ", words: ["ЭСПРЕССО", "КАПУЧИНО", "ЛАТТЕ", "АМЕРИКАНО"], color: "#ba81c5" }
    ]
  },
  {
    difficulty: "medium",
    categories: [
      { theme: "РУССКИЕ ХУДОЖНИКИ", words: ["РЕПИН", "ШИШКИН", "АЙВАЗОВСКИЙ", "ЛЕВИТАН"], color: "#f9df6d" },
      { theme: "ВИДЫ ШОКОЛАДА", words: ["ГОРЬКИЙ", "МОЛОЧНЫЙ", "БЕЛЫЙ", "РУБИНОВЫЙ"], color: "#a0c35a" },
      { theme: "МУЗЫКАЛЬНЫЕ НОТЫ", words: ["ДО", "РЕ", "МИ", "СОЛЬ"], color: "#b0c4ef" },
      { theme: "ТИПЫ ПОЧВ", words: ["ЧЕРНОЗЁМ", "ГЛИНА", "ПЕСОК", "ТОРФ"], color: "#ba81c5" }
    ]
  },
  {
    difficulty: "medium",
    categories: [
      { theme: "СТОЛИЦЫ ЕВРОПЫ", words: ["БЕРЛИН", "МАДРИД", "ВЕНА", "ПРАГА"], color: "#f9df6d" },
      { theme: "ОТТЕНКИ СИНЕГО", words: ["ГОЛУБОЙ", "ЛАЗУРНЫЙ", "ИНДИГО", "БИРЮЗОВЫЙ"], color: "#a0c35a" },
      { theme: "ВИДЫ СЫРА", words: ["ПАРМЕЗАН", "МОЦАРЕЛЛА", "БЕРИ", "ЧЕДДЕР"], color: "#b0c4ef" },
      { theme: "ДРЕВНИЕ ЦИВИЛИЗАЦИИ", words: ["ЕГИПЕТ", "ГРЕЦИЯ", "РИМ", "ШУМЕР"], color: "#ba81c5" }
    ]
  },
  {
    difficulty: "medium",
    categories: [
      { theme: "ВИДЫ ЭНЕРГИИ", words: ["СОЛНЕЧНАЯ", "ВЕТРОВАЯ", "АТОМНАЯ", "ТЕПЛОВАЯ"], color: "#f9df6d" },
      { theme: "ТАНЦЕВАЛЬНЫЕ СТИЛИ", words: ["БРЕЙК", "ФЛАМЕНКО", "ХАСТЛ", "ЧЕЧЁТКА"], color: "#a0c35a" },
      { theme: "КОСМОС", words: ["ГАЛАКТИКА", "КВАЗАР", "ПУЛЬСАР", "НЕЙТРОННАЯ"], color: "#b0c4ef" },
      { theme: "ВИДЫ МАКАРОН", words: ["СПАГЕТТИ", "ПЕННЕ", "ФАРФАЛЛЕ", "ТАЛЬЯТЕЛЛЕ"], color: "#ba81c5" }
    ]
  },
  {
    difficulty: "medium",
    categories: [
      { theme: "ВИДЫ ТЕАТРА", words: ["ОПЕРА", "БАЛЕТ", "МЮЗИКЛ", "ПАНТОМИМА"], color: "#f9df6d" },
      { theme: "ВИДЫ ХЛЕБА", words: ["БАГЕТ", "ЛАВАШ", "ЧИАБАТТА", "КАРАВАЙ"], color: "#a0c35a" },
      { theme: "РУССКИЕ КОМПОЗИТОРЫ", words: ["ЧАЙКОВСКИЙ", "РАХМАНИНОВ", "МУСОРГСКИЙ", "ПРОКОФЬЕВ"], color: "#b0c4ef" },
      { theme: "ПРЯНОСТИ", words: ["ГВОЗДИКА", "ИМБИРЬ", "МУСКАТ", "ТМИН"], color: "#ba81c5" }
    ]
  },
  {
    difficulty: "medium",
    categories: [
      { theme: "ВИДЫ ВИНА", words: ["МЕРЛО", "КАБЕРНЕ", "РИСЛИНГ", "ШАРДОНЕ"], color: "#f9df6d" },
      { theme: "ОСТРОВНЫЕ СТРАНЫ", words: ["ЯПОНИЯ", "КУБА", "МАДАГАСКАР", "ИСЛАНДИЯ"], color: "#a0c35a" },
      { theme: "ВИДЫ СПОРТА С МЯЧОМ", words: ["БАСКЕТБОЛ", "ВОЛЕЙБОЛ", "ГАНДБОЛ", "РЕГБИ"], color: "#b0c4ef" },
      { theme: "ВИДЫ ГРУНТА", words: ["СУГЛИНОК", "СУПЕСЬ", "ИЗВЕСТНЯК", "ЩЕБЕНЬ"], color: "#ba81c5" }
    ]
  },
  {
    difficulty: "medium",
    categories: [
      { theme: "ОРГАНЫ ЧЕЛОВЕКА", words: ["ПЕЧЕНЬ", "ПОЧКА", "ЛЁГКОЕ", "СЕЛЕЗЁНКА"], color: "#f9df6d" },
      { theme: "ВИДЫ ЗАМКОВ", words: ["НАВЕСНОЙ", "ВРЕЗНОЙ", "КОДОВЫЙ", "ЭЛЕКТРОННЫЙ"], color: "#a0c35a" },
      { theme: "СТОЛИЦЫ АЗИИ", words: ["ПЕКИН", "ДЕЛИ", "БАНГКОК", "СЕУЛ"], color: "#b0c4ef" },
      { theme: "ОТТЕНКИ КРАСНОГО", words: ["АЛЫЙ", "БОРДОВЫЙ", "МАЛИНОВЫЙ", "КОРАЛЛОВЫЙ"], color: "#ba81c5" }
    ]
  },
  {
    difficulty: "medium",
    categories: [
      { theme: "ВИДЫ БУМАГИ", words: ["КАРТОН", "ПЕРГАМЕНТ", "КАЛЬКА", "ВАТМАН"], color: "#f9df6d" },
      { theme: "ДУХОВЫЕ ИНСТРУМЕНТЫ", words: ["ФЛЕЙТА", "ТРУБА", "КЛАРНЕТ", "САКСОФОН"], color: "#a0c35a" },
      { theme: "ВИДЫ ЛЕСА", words: ["ТАЙГА", "ДЖУНГЛИ", "САВАННА", "РОЩА"], color: "#b0c4ef" },
      { theme: "ВИДЫ САЛАТОВ", words: ["ЦЕЗАРЬ", "ОЛИВЬЕ", "ГРЕЧЕСКИЙ", "МИМОЗА"], color: "#ba81c5" }
    ]
  },
  {
    difficulty: "medium",
    categories: [
      { theme: "ГОРНЫЕ ПОРОДЫ", words: ["ГРАНИТ", "МРАМОР", "БАЗАЛЬТ", "СЛАНЕЦ"], color: "#f9df6d" },
      { theme: "ПУСТЫНИ", words: ["САХАРА", "ГОБИ", "КАЛАХАРИ", "АТАКАМА"], color: "#a0c35a" },
      { theme: "ВИДЫ ТАНКОВ", words: ["ТИГР", "ПАНТЕРА", "АБРАМС", "ЛЕОПАРД"], color: "#b0c4ef" },
      { theme: "ВИДЫ ПИЦЦЫ", words: ["МАРГАРИТА", "ПЕППЕРОНИ", "ГАВАЙСКАЯ", "ЧЕТЫРЕ СЫРА"], color: "#ba81c5" }
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
{
    difficulty: "hard",
    categories: [
      { theme: "СЛОВА С КОРНЕМ -ВОД-", words: ["ВОДОПАД", "ПРОВОДНИК", "ХОРОВОД", "ВВОДНЫЙ"], color: "#f9df6d" },
      { theme: "ДРЕВНЕРИМСКИЕ ДОЛЖНОСТИ", words: ["КОНСУЛ", "ТРИБУН", "ПРЕТОР", "ЦЕНЗОР"], color: "#a0c35a" },
      { theme: "ТИПЫ ОБЛИГАЦИЙ", words: ["МУНИЦИПАЛЬНАЯ", "КОРПОРАТИВНАЯ", "ФЕДЕРАЛЬНАЯ", "СУБОРДИНИРОВАННАЯ"], color: "#b0c4ef" },
      { theme: "МУЗЫКАЛЬНЫЕ ТЕМПЫ", words: ["АДАЖИО", "АЛЛЕГРО", "АНДАНТЕ", "ПРЕСТО"], color: "#ba81c5" }
    ]
  },
  {
    difficulty: "hard",
    categories: [
      { theme: "ЖЕНСКИЕ ИМЕНА = ПРЕДМЕТЫ", words: ["ЛИРА", "ВЕРА", "РОЗА", "МАРИНА"], color: "#f9df6d" },
      { theme: "ВИДЫ ВЕТРА", words: ["МУССОН", "ПАССАТ", "БРИЗ", "ШТИЛЬ"], color: "#a0c35a" },
      { theme: "РЕКИ РОССИИ", words: ["ОБЬ", "ИРТЫШ", "ЕНИСЕЙ", "АНГАРА"], color: "#b0c4ef" },
      { theme: "ТИПЫ МОСТОВ", words: ["АРОЧНЫЙ", "ВАНТОВЫЙ", "ПОНТОННЫЙ", "РАЗВОДНОЙ"], color: "#ba81c5" }
    ]
  },
  {
    difficulty: "hard",
    categories: [
      { theme: "ФИГУРЫ РЕЧИ", words: ["ЛИТОТА", "ОКСЮМОРОН", "СИНЕКДОХА", "МЕТОНИМИЯ"], color: "#f9df6d" },
      { theme: "ВИДЫ КАРТ", words: ["ТОПОГРАФИЧЕСКАЯ", "ПОЛИТИЧЕСКАЯ", "ФИЗИЧЕСКАЯ", "КЛИМАТИЧЕСКАЯ"], color: "#a0c35a" },
      { theme: "МАТЕМАТИЧЕСКИЕ ЗНАКИ", words: ["ИНТЕГРАЛ", "СИГМА", "ДЕЛЬТА", "ГРАДИЕНТ"], color: "#b0c4ef" },
      { theme: "СТИЛИ ПЛАВАНИЯ", words: ["КРОЛЬ", "БРАСС", "БАТТЕРФЛЯЙ", "НА СПИНЕ"], color: "#ba81c5" }
    ]
  },
  {
    difficulty: "hard",
    categories: [
      { theme: "СЛОВА-ПЕРЕВЁРТЫШИ", words: ["ТОПОР", "ЛЕСУ", "НАГАР", "РОПОТ"], color: "#f9df6d" },
      { theme: "ОЗЁРА МИРА", words: ["БАЙКАЛ", "ТИТИКАКА", "ТАНГАНЬИКА", "ВИКТОРИЯ"], color: "#a0c35a" },
      { theme: "ЛАТИНСКИЕ ВЫРАЖЕНИЯ", words: ["АЛЬМА-МАТЕР", "ПОСТСКРИПТУМ", "АПРИОРИ", "ВЕТО"], color: "#b0c4ef" },
      { theme: "ЖАНРЫ ЖИВОПИСИ", words: ["ПЕЙЗАЖ", "ПОРТРЕТ", "НАТЮРМОРТ", "МАРИНА"], color: "#ba81c5" }
    ]
  },
  {
    difficulty: "hard",
    categories: [
      { theme: "ВИДЫ СВЯЗИ", words: ["ТЕЛЕГРАФ", "СЕМАФОР", "ГОЛУБИНАЯ", "РАДИО"], color: "#f9df6d" },
      { theme: "ГРЕЧЕСКИЕ БУКВЫ", words: ["ОМЕГА", "ЛЯМБДА", "ТЕТА", "ЭПСИЛОН"], color: "#a0c35a" },
      { theme: "ВИДЫ ГРУНТОВОК", words: ["АКРИЛОВАЯ", "АЛКИДНАЯ", "МИНЕРАЛЬНАЯ", "КВАРЦЕВАЯ"], color: "#b0c4ef" },
      { theme: "ВИДЫ СТРАХОВАНИЯ", words: ["КАСКО", "ОСАГО", "ЖИЗНИ", "ИМУЩЕСТВА"], color: "#ba81c5" }
    ]
  },
  {
    difficulty: "hard",
    categories: [
      { theme: "ВИДЫ ДОЖДЯ", words: ["ЛИВЕНЬ", "МОРОСЬ", "ГРАД", "ИЗМОРОСЬ"], color: "#f9df6d" },
      { theme: "ЧАСТИ КНИГИ", words: ["ПРОЛОГ", "ЭПИЛОГ", "ГЛАВА", "ПРЕДИСЛОВИЕ"], color: "#a0c35a" },
      { theme: "ДРЕВНЕГРЕЧЕСКИЕ ГЕРОИ", words: ["АХИЛЛ", "ОДИССЕЙ", "ТЕСЕЙ", "ГЕРАКЛ"], color: "#b0c4ef" },
      { theme: "ТИПЫ ГРАФОВ", words: ["ДЕРЕВО", "ЦИКЛ", "ПЛАНАРНЫЙ", "ДВУДОЛЬНЫЙ"], color: "#ba81c5" }
    ]
  },
  {
    difficulty: "hard",
    categories: [
      { theme: "ТИПЫ ЭЛЕКТРОСТАНЦИЙ", words: ["ГИДРО", "ТЕПЛОВАЯ", "АТОМНАЯ", "ПРИЛИВНАЯ"], color: "#f9df6d" },
      { theme: "МИФЫ НАРОДОВ МИРА", words: ["ОДИН", "АНУБИС", "КРИШНА", "КЕЦАЛЬКОАТЛЬ"], color: "#a0c35a" },
      { theme: "ВИДЫ ПЕЧАТИ", words: ["ОФСЕТНАЯ", "ТРАФАРЕТНАЯ", "ЦИФРОВАЯ", "ФЛЕКСОГРАФИЯ"], color: "#b0c4ef" },
      { theme: "ВИДЫ СПЛАВОВ", words: ["БРОНЗА", "ЛАТУНЬ", "ЧУГУН", "СТАЛЬ"], color: "#ba81c5" }
    ]
  },
  {
    difficulty: "hard",
    categories: [
      { theme: "ВИДЫ УЗЛОВ", words: ["БУЛИНЬ", "ШТЫК", "ВОСЬМЁРКА", "УДАВКА"], color: "#f9df6d" },
      { theme: "СТОЛИЦЫ НА БУКВУ Б", words: ["БУХАРЕСТ", "БУДАПЕШТ", "БРАЗИЛИА", "БОГОТА"], color: "#a0c35a" },
      { theme: "ТИПЫ АККОРДОВ", words: ["МАЖОР", "МИНОР", "СЕПТАККОРД", "ДИМИНИШЕД"], color: "#b0c4ef" },
      { theme: "ВИДЫ ЛИНЗ", words: ["ВЫПУКЛАЯ", "ВОГНУТАЯ", "ПЛОСКАЯ", "ФРЕНЕЛЯ"], color: "#ba81c5" }
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
  },
   {
    difficulty: "expert",
    categories: [
      { theme: "ЗНАЧЕНИЯ СЛОВА 'РУЧКА'", words: ["ДВЕРНАЯ", "ШАРИКОВАЯ", "ДЕТСКАЯ", "ЧЕМОДАНА"], color: "#f9df6d" },
      { theme: "ЗНАЧЕНИЯ СЛОВА 'КРАН'", words: ["ВОДОПРОВОДНЫЙ", "БАШЕННЫЙ", "МОСТОВОЙ", "ШАРОВОЙ"], color: "#a0c35a" },
      { theme: "ЗНАЧЕНИЯ СЛОВА 'СРЕДА'", words: ["ДЕНЬ НЕДЕЛИ", "ОКРУЖАЮЩАЯ", "ПИТАТЕЛЬНАЯ", "ОБИТАНИЯ"], color: "#b0c4ef" },
      { theme: "ЗНАЧЕНИЯ СЛОВА 'СВЕТ'", words: ["СОЛНЕЧНЫЙ", "ВЫСШИЙ", "БЕЛЫЙ", "ЛУННЫЙ"], color: "#ba81c5" }
    ]
  },
  {
    difficulty: "expert",
    categories: [
      { theme: "МНЕМОНИЧЕСКИЕ ПРАВИЛА", words: ["БИСЕР", "ФАЗАН", "КАЖДЫЙ", "ОХОТНИК"], color: "#f9df6d" },
      { theme: "ЭПОНИМЫ В МЕДИЦИНЕ", words: ["АЛЬЦГЕЙМЕР", "ПАРКИНСОН", "БАЗЕДОВ", "БОТКИН"], color: "#a0c35a" },
      { theme: "ВИДЫ ПАРАДОКСОВ", words: ["ЛЖЕЦ", "КОРАБЛЬ ТЕСЕЯ", "ДЕДУШКИН", "БУРИДАНОВ"], color: "#b0c4ef" },
      { theme: "ТОПОЛОГИЧЕСКИЕ ФИГУРЫ", words: ["ЛЕНТА МЁБИУСА", "БУТЫЛКА КЛЕЙНА", "СФЕРА", "ПРОЕКТИВНАЯ"], color: "#ba81c5" }
    ]
  },
  {
    difficulty: "expert",
    categories: [
      { theme: "СЛОВА ИЗ МУЗЫКИ В БЫТУ", words: ["КАМЕРТОН", "ОКТАВА", "ПРЕЛЮДИЯ", "УВЕРТЮРА"], color: "#f9df6d" },
      { theme: "МЫСЛЕННЫЕ ЭКСПЕРИМЕНТЫ", words: ["КОТ ШРЁДИНГЕРА", "ДЕМОН МАКСВЕЛЛА", "КОМНАТА МЭРИ", "ЗОМБИ"], color: "#a0c35a" },
      { theme: "ТИПЫ АЛГОРИТМОВ", words: ["ЖАДНЫЙ", "РЕКУРСИВНЫЙ", "ГЕНЕТИЧЕСКИЙ", "ЭВРИСТИЧЕСКИЙ"], color: "#b0c4ef" },
      { theme: "ВИДЫ ЛОГИЧЕСКИХ ВЕНТИЛЕЙ", words: ["И", "ИЛИ", "НЕ", "ИСКЛЮЧАЮЩЕЕ"], color: "#ba81c5" }
    ]
  },
  {
    difficulty: "expert",
    categories: [
      { theme: "ГОРОД = ЧЕЛОВЕК", words: ["ВАШИНГТОН", "АЛЕКСАНДРИЯ", "ВЕЛЛИНГТОН", "ХАБАРОВСК"], color: "#f9df6d" },
      { theme: "ВИДЫ ИЗЛУЧЕНИЯ", words: ["АЛЬФА", "БЕТА", "ГАММА", "РЕНТГЕН"], color: "#a0c35a" },
      { theme: "ВИДЫ ЛОГАРИФМОВ", words: ["НАТУРАЛЬНЫЙ", "ДЕСЯТИЧНЫЙ", "ДВОИЧНЫЙ", "ДИСКРЕТНЫЙ"], color: "#b0c4ef" },
      { theme: "ЛОЖНЫЕ ДРУЗЬЯ ПЕРЕВОДЧИКА", words: ["МАГАЗИН", "ФАБРИКА", "РЕЦЕПТ", "БЛАНК"], color: "#ba81c5" }
    ]
  },
  {
    difficulty: "expert",
    categories: [
      { theme: "ЧИСЛА ФИБОНАЧЧИ", words: ["ОДИН", "ДВА", "ТРИ", "ПЯТЬ"], color: "#f9df6d" },
      { theme: "ВИДЫ ФУГИ", words: ["ПРОСТАЯ", "ДВОЙНАЯ", "ТРОЙНАЯ", "ЗЕРКАЛЬНАЯ"], color: "#a0c35a" },
      { theme: "ЗАКОНЫ ФИЗИКИ", words: ["АРХИМЕД", "КУЛОН", "ФАРАДЕЙ", "ДЖОУЛЬ"], color: "#b0c4ef" },
      { theme: "ФАЛЛАЦИИ АРГУМЕНТАЦИИ", words: ["СОЛОМЕННОЕ ЧУЧЕЛО", "СКОЛЬЗКИЙ СКЛОН", "КРАСНАЯ СЕЛЁДКА", "AD HOMINEM"], color: "#ba81c5" }
    ]
  },
  {
    difficulty: "expert",
    categories: [
      { theme: "ДВОЙНЫЕ ЗНАЧЕНИЯ В IT", words: ["ПИТОН", "РУБИН", "ДЖАВА", "ПЕРЛ"], color: "#f9df6d" },
      { theme: "ВИДЫ МАТРИЦ", words: ["ЕДИНИЧНАЯ", "НУЛЕВАЯ", "ДИАГОНАЛЬНАЯ", "СИММЕТРИЧНАЯ"], color: "#a0c35a" },
      { theme: "МУЗЫКАЛЬНЫЕ ФОРМЫ", words: ["РОНДО", "СОНАТА", "ФУГА", "КАПРИС"], color: "#b0c4ef" },
      { theme: "ВИДЫ СПЕКТРОСКОПИИ", words: ["МАСС", "ИНФРАКРАСНАЯ", "РАМАНОВСКАЯ", "ЯДЕРНАЯ"], color: "#ba81c5" }
    ]
  },
  {
    difficulty: "expert",
    categories: [
      { theme: "СЛОВО НАОБОРОТ = СЛОВО", words: ["ТОК", "ЛЕС", "НОС", "КОТ"], color: "#f9df6d" },
      { theme: "ВИДЫ ФИНАНСОВЫХ РЫНКОВ", words: ["ФОНДОВЫЙ", "ВАЛЮТНЫЙ", "ТОВАРНЫЙ", "СРОЧНЫЙ"], color: "#a0c35a" },
      { theme: "ВИДЫ ПОЛИМЕРОВ", words: ["НЕЙЛОН", "КАПРОН", "ЛАВСАН", "ТЕФЛОН"], color: "#b0c4ef" },
      { theme: "ТИПЫ НАРРАТИВА", words: ["НЕНАДЁЖНЫЙ", "ВСЕЗНАЮЩИЙ", "ОТ ПЕРВОГО ЛИЦА", "ПОТОК СОЗНАНИЯ"], color: "#ba81c5" }
    ]
  },
  {
    difficulty: "expert",
    categories: [
      { theme: "ЖИВОТНОЕ = ФАМИЛИЯ", words: ["ЗАЙЦЕВ", "МЕДВЕДЕВ", "БАРАНОВ", "КОЗЛОВ"], color: "#f9df6d" },
      { theme: "ВИДЫ ДИАГРАММ В IT", words: ["ГАНТА", "КЕЙСОВ", "КЛАССОВ", "ПОСЛЕДОВАТЕЛЬНОСТИ"], color: "#a0c35a" },
      { theme: "ВИДЫ СТРАТЕГИЙ", words: ["БЛИЦКРИГ", "АТРИЦИЯ", "ПАРТИЗАНСКАЯ", "ФАБИАНСКАЯ"], color: "#b0c4ef" },
      { theme: "ВИДЫ ЧИСЛОВЫХ МНОЖЕСТВ", words: ["НАТУРАЛЬНЫЕ", "ЦЕЛЫЕ", "РАЦИОНАЛЬНЫЕ", "ИРРАЦИОНАЛЬНЫЕ"], color: "#ba81c5" }
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
