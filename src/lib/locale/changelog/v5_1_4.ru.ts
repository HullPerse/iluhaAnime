const changelog514 = {
  "changelog.5_1_4.fixed.torrents.covers_build":
    "Обложки раздач в поиске снова показываются после сборки: при запуске с сохранённой сессией AniList авто-режим обложек включается сразу, а не только после повторного входа",
  "changelog.5_1_4.fixed.search.logout":
    "Выход из RuTracker, nekoBT и Erai-Raws сразу обновляет панель поиска, не дожидаясь проверки сессий",
  "changelog.5_1_4.fixed.player.ffmpeg_delete":
    "Кнопка удаления FFmpeg удаляет скачанную копию, а для системного FFmpeg из PATH показывает причину вместо тихой ошибки",
} as const;

export default changelog514;
