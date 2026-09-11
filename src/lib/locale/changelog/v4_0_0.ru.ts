const changelog400 = {
  "changelog.4_0_0.added.modern_tab":
    "Современная вкладка поиска с лабораторией дизеринг-обоев",
  "changelog.4_0_0.added.dither_presets":
    "Пресеты дизеринга, палитры и подбор цветов с картинки",
  "changelog.4_0_0.added.wallpaper_fx":
    "Параллакс обоев, оверлей сканлайнов и CRT-пресет запекания",
  "changelog.4_0_0.added.spotlight":
    "Аниме дня, недели и месяца с отсчетом обновления",
  "changelog.4_0_0.added.random_menu":
    "Случайный тайтл из меню данных коллекции",
  "changelog.4_0_0.added.random_filters":
    "Случайное аниме по фильтрам AniList",
  "changelog.4_0_0.added.deeplinks":
    "Ссылки iluhaanime:// на аниме с кнопкой копирования",
  "changelog.4_0_0.added.release_dates":
    "Даты выхода везде: визард, обновление, быстрое добавление, импорт",
  "changelog.4_0_0.added.tag_ranges":
    "Диапазоны тегов (year=2000...2010) и нечеткий поиск (year~=2000) с настройкой допусков",
  "changelog.4_0_0.added.franchise":
    "Список франшизы и раздел похожих в деталях аниме",
  "changelog.4_0_0.added.fav_people":
    "Избранное для тайтлов, авторов и персонажей из видов AniList",
  "changelog.4_0_0.added.bilingual_labels":
    "Названия кастомных статусов на двух языках",
  "changelog.4_0_0.added.descriptions":
    "Описания коллекции из AniList и TMDB",
  "changelog.4_0_0.added.filmstrip":
    "Просмотр кадров-стиллов лентой внутри приложения",
  "changelog.4_0_0.added.fonts":
    "Глобальный выбор шрифта: системные шрифты и загрузка файлов",
  "changelog.4_0_0.added.sqlite_editor":
    "SQLite-браузер: SQL-редактор с подсветкой и конструктор фильтров",
  "changelog.4_0_0.added.autocomplete":
    "Обучающиеся подсказки поиска с приоритетом коллекции и инлайн-призраком",
  "changelog.4_0_0.added.host_stats":
    "Загрузка CPU, RAM и сети хоста в футере торрентов и панели апскейла",
  "changelog.4_0_0.changed.tag_syntax":
    "Синтаксис тегов: `:` больше не оператор, точное совпадение через `=`",
  "changelog.4_0_0.changed.anilist_tags":
    "Теги только для коллекции и сливаются с жанрами",
  "changelog.4_0_0.changed.jobcenter":
    "Центр задач удален; очередь и скан папок живут в своих панелях",
  "changelog.4_0_0.changed.semantic":
    "Офлайн семантический поиск удален",
  "changelog.4_0_0.changed.gif":
    "Анимированные GIF больше не ставятся обоями",
  "changelog.4_0_0.changed.videoplayer":
    "Проигрывание трейлеров и медиа переведено на единый видеоплеер",
  "changelog.4_0_0.changed.status_ui":
    "Полоса статусов и менеджер перестроены вокруг основных и кастомных секций",
  "changelog.4_0_0.changed.squares":
    "Вкладки списков AniList показывают статусные квадраты как в коллекции",
  "changelog.4_0_0.changed.tmdb_key":
    "Ключ TMDB переехал в системное хранилище, токены v4 поддерживаются",
  "changelog.4_0_0.changed.list_rows":
    "Строки списка коллекции открывают детали и показывают студию/год/жанры",
  "changelog.4_0_0.changed.autopause":
    "Автопауза срабатывает один раз по завершении загрузки",
  "changelog.4_0_0.changed.hints":
    "Более короткие подсказки в настройках и модалках",
  "changelog.4_0_0.changed.plurals_time":
    "Правильные русские plural-формы и единый формат времени",
  "changelog.4_0_0.fixed.crash":
    "Плеер больше не падает при загрузке состояний файлов торрента",
  "changelog.4_0_0.fixed.fresh_images":
    "Картинки грузятся на свежих профилях вместо ошибки всех команд",
  "changelog.4_0_0.fixed.status_order":
    "Кастомные статусы сохраняются с правильным порядком, включая старые кэши",
  "changelog.4_0_0.fixed.files":
    "Файлы показываются для каждого торрента, ошибки видны по каждому",
  "changelog.4_0_0.fixed.quickadd":
    "Быстрое добавление сохраняет год, тип movie, id AniList и дату старта",
  "changelog.4_0_0.fixed.refresh_touch":
    "Обновление метаданных больше не двигает тайтлы в сортировке по дате",
  "changelog.4_0_0.fixed.tmdb_covers":
    "Обложки TMDB грузятся через кэш бэкенда",
} as const;

export default changelog400;
