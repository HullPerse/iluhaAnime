const changelog510 = {
  "changelog.5_1_0.added.app.offline_banner":
    "Баннер офлайн-состояния: какие вкладки работают без сети, а какие требуют интернет, плюс состояние деградации сети с повторной проверкой",
  "changelog.5_1_0.added.settings.proxy_test":
    "Тест подключения прокси в настройках с прогрессом, отменой и повторной проверкой",
  "changelog.5_1_0.added.settings.cache_stats":
    "Хитрейты кэша AniList и ffprobe в сводке настроек",
  "changelog.5_1_0.added.settings.sidecar_tracks":
    "Автозагрузка подходящих сайдкар-треков и скан подпапок для них",
  "changelog.5_1_0.added.anilist.local_filter":
    "Локальная панель фильтров в AniList с тегами, студиями и поиском",
  "changelog.5_1_0.added.streaming.deep_links":
    "Расшариваемые ссылки стримов в формате iluhaAnime://stream/... и память маршрута для целей стрима",
  "changelog.5_1_0.changed.settings.proxy":
    "Настройки прокси переработаны в отдельные секции для торрентов и источников",
  "changelog.5_1_0.changed.torrents.proxy_coverage":
    "Прокси торрентов теперь показывает покрытие и предупреждает об ограничениях SOCKS5 с авторизацией",
  "changelog.5_1_0.changed.app.cache_recovery":
    "Кэш ffprobe при переполнении вытесняет четверть записей вместо полной очистки и восстанавливается после отравленной блокировки",
  "changelog.5_1_0.changed.player.chapters":
    "Клавиши глав теперь переключают файлы при использовании Shift или Ctrl",
  "changelog.5_1_0.changed.player.stream_error":
    "Ошибки загрузки стрима показывают отдельную подсказку и кнопку повтора",
  "changelog.5_1_0.changed.streaming.details":
    "Улучшения деталей и списка стримов для медленного соединения",
  "changelog.5_1_0.fixed.player.issues":
    "Исправлены проблемы воспроизведения, скриншотов и управления плеером",
  "changelog.5_1_0.fixed.streaming.details":
    "Исправлены детали стрима и загрузка обложек",
  "changelog.5_1_0.fixed.proxy": "Исправлены подключение и авторизация прокси",
} as const;

export default changelog510;
