const changelog516 = {
  "changelog.5_1_6.fixed.anilist.new_entry":
    "Добавление тайтла, которого нет ни в одном списке, больше не падает: статус по умолчанию пустой, а незаполненные прогресс и оценка не отправляются в AniList как null",
  "changelog.5_1_6.fixed.anilist.error_details":
    "Ошибки сохранения AniList теперь показывают причину из ответа, а клиентские ошибки больше не повторяются трижды",
  "changelog.5_1_6.fixed.search.logout":
    "Выход из RuTracker, nekoBT и Erai-Raws сразу обновляет панель поиска, не дожидаясь проверки сессий",
  "changelog.5_1_6.fixed.player.ffmpeg_delete":
    "Кнопка удаления FFmpeg удаляет скачанную копию, а для системного FFmpeg из PATH показывает причину вместо тихой ошибки",
} as const;

export default changelog516;
