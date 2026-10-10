const changelog500 = {
  "changelog.5_0_0.added.player.native_player":
    "Built-in mpv player in a separate window: classic skin, play and pause, seeking, audio and subtitle tracks, jump to time, cheat sheet, and a persistent playlist sidebar with a queue manager",
  "changelog.5_0_0.added.player.profiles":
    "Player profiles Basic, Speed and Quality, hardware decoding settings, HDR tone mapping controls, and loudness normalization",
  "changelog.5_0_0.added.player.osd":
    "Live diagnostics overlay with fps, dropped frames, cache and decoder state, plus a watchdog toast when frames start dropping",
  "changelog.5_0_0.added.player.eof":
    "End of file behavior setting: do nothing, pause at the end, play the next file, or repeat",
  "changelog.5_0_0.added.player.categories": "Category import and export for the player library",
  "changelog.5_0_0.added.player.playlist_dnd":
    "Playlist drag and drop reorder, prefetch of the next file, and virtualization past 50 rows",
  "changelog.5_0_0.added.player.neighbor_preview":
    "Hovering the previous and next file buttons shows a card of the file they will play: thumbnail, title, and duration",
  "changelog.5_0_0.added.player.clean_frame":
    "Clean frame capture with Ctrl+Shift+O, Windows style screenshot names, pan with the right mouse button, and edge resize in the editor",
  "changelog.5_0_0.added.torrents.dashboard":
    "Torrent dashboard: speed graph for download and upload, connected peer count, DHT node count, and the listen port in the summary bar",
  "changelog.5_0_0.added.torrents.export_file":
    "Export of the .torrent file for any download from the torrent header",
  "changelog.5_0_0.added.torrents.bulk":
    "Bulk actions for selected torrents: pause, resume, recheck, delete, add tracker, and set speed limits",
  "changelog.5_0_0.added.torrents.new_files":
    "New files check: the button compares the torrent file list with the tracker state and offers the new files for download",
  "changelog.5_0_0.added.torrents.speed_schedule":
    "Day and night speed scheduler: download and upload limits switch automatically by local time",
  "changelog.5_0_0.added.torrents.picker_seeders":
    "Seeder counts from search results in the add torrent picker header",
  "changelog.5_0_0.added.torrents.release_age":
    "Release age column for nyaa and sukebei results with sorting by date",
  "changelog.5_0_0.added.torrents.rename":
    "Custom torrent names with rename and clear actions, and copy buttons for the magnet link and the info hash",
  "changelog.5_0_0.added.torrents.update_check":
    "Release update check: torrents downloaded from search remember their source page, the check button re-reads the release and stays silent when nothing changed, opens the file picker on new files, and applies the update from fresh .torrent bytes",
  "changelog.5_0_0.added.torrents.external_watch":
    "External changes watch: paused and finished torrents detect files modified outside the app, with a row badge, a warning toast, and one-click recheck",
  "changelog.5_0_0.added.settings.theme_schedule":
    "Day and night theme scheduler: the theme switches automatically by local time",
  "changelog.5_0_0.added.settings.title_toggles":
    "Title parsing split into three toggles: player header, folders and playlist, torrent file lists, and torrent search results switch separately",
  "changelog.5_0_0.added.search.query_tags":
    "Torrent query tags with highlighting: quality, codec, language, seed count, size, and source map onto filters at submit",
  "changelog.5_0_0.added.search.filter_presets":
    "Named filter presets: save the current settings under a name, apply with one click, delete with the cross",
  "changelog.5_0_0.added.search.did_you_mean":
    "Live spell check in search fields: amber underline for close matches, red for distant ones, click applies the correction, right click adds the word to the personal dictionary",
  "changelog.5_0_0.added.search.exact_match":
    "Exact title matches now appear in suggestions for one click repeat, and an empty field ranks history by usage",
  "changelog.5_0_0.added.anilist.compare_clicks":
    "Clickable titles in friend comparison that open details, copy comparison to clipboard, and an expand button past 60 rows",
  "changelog.5_0_0.added.anilist.activity_likes":
    "Likes on activity entries with counts and optimistic updates",
  "changelog.5_0_0.added.anilist.notes_lists":
    "Multiline list notes and custom list checkboxes in the list editor",
  "changelog.5_0_0.added.anilist.released_tab":
    "Released tab in Statistics with the aired episode feed and an unread badge on the AniList tab",
  "changelog.5_0_0.added.anilist.site_notifications":
    "Native AniList notifications tab in the activity window: airing, likes, replies, follows, and mentions with local read marking",
  "changelog.5_0_0.added.anilist.progress_stepper":
    "Progress stepper on anime cards with plus and minus episode buttons",
  "changelog.5_0_0.added.anilist.title_language":
    "Anime title language preference: account setting, romaji, english, or native",
  "changelog.5_0_0.added.app.notification_toggles":
    "Every notification source has its own toggle in Settings Notifications, grouped by AniList, torrents, player, tasks, and app",
  "changelog.5_0_0.added.anilist.status_matrix":
    "AniList status toasts cover the full list matrix plus anime finished, hiatus, and cancelled states, and your own list edits no longer notify",
  "changelog.5_0_0.added.anilist.site_toasts":
    "Toasts for subscribed activity replies, sequels, entry merges and deletions, with manga filtered out of site notifications",
  "changelog.5_0_0.added.torrents.health":
    "Torrent health warnings for missing data files and externally changed files",
  "changelog.5_0_0.added.player.newfiles":
    "Watched folders report new files: snapshot check on scan plus a 30 minute recheck",
  "changelog.5_0_0.added.app.update_toast": "One-shot tray notice when an app update is found",
  "changelog.5_0_0.added.app.task_toasts":
    "Completion toasts for upscale, convert, and tool downloads, plus backup errors and scan failure surfacing",
  "changelog.5_0_0.added.anilist.activity_detail":
    "Anime details from the activity feed and notifications open inside the same window with Back",
  "changelog.5_0_0.added.settings.progress_style":
    "Progress bar style choice in Settings Theme: blocky segments or a solid fill across the whole app",
  "changelog.5_0_0.added.settings.progress_colors":
    "Progress colors in the theme editor: one main progress color plus all torrent states",
  "changelog.5_0_0.added.settings.theme_overlays":
    "Per-theme overlays: scanline grid and scanlines, YoRHa and Terminal lead",
  "changelog.5_0_0.added.settings.anilist_theme": "New dark AniList theme with a scanline grid",
  "changelog.5_0_0.added.settings.theme_card_variants":
    "Titlebar art and compact card meta on select themes",
  "changelog.5_0_0.added.search.result_covers":
    "Optional cover thumbnails in torrent search results: off by default and needs AniList sign-in, covers resolve from your library and the torrent page, and right-click correction with candidate picks that the app remembers",
  "changelog.5_0_0.added.torrents.erai_proxy_login":
    "Erai-Raws sign-in opens the site window through your proxy, same as Rutracker, with the proxy password filled in by itself",
  "changelog.5_0_0.added.torrents.webview_proxy":
    "New switch in Settings > Search: the built-in login windows use the per-source proxy, or connect directly when it is off",
  "changelog.5_0_0.added.torrents.file_icons":
    "File rows in torrent file lists and player folders show a Windows 95 icon per file type: video, audio, subtitles, archives, fonts, images, and text",
  "changelog.5_0_0.added.settings.repro_bundle":
    "Bug report bundle from Settings > Summary: a zip with app and system metadata, a sanitized settings snapshot with secrets removed, and the app data folder listing. No media, database rows, tokens, or keys",
  "changelog.5_0_0.changed.anilist.batch_fetch":
    "AniList list, score, and media fetching runs at most 3 parallel requests with similar requests merged, so collections and friend data load in fewer server requests",
  "changelog.5_0_0.changed.search.scoring_unify":
    "Search suggestion scoring now uses the same day, week, and month steps as the SQL ranking, so suggestions and history agree",
  "changelog.5_0_0.changed.search.fts_startup":
    "Full text index optimization moved to a background thread at startup",
  "changelog.5_0_0.changed.app.folder_scan":
    "Folder scans are faster with a parallel directory walk, and folder watching calms event bursts with a 1 second settle delay",
  "changelog.5_0_0.changed.player.tree_build":
    "Player folder tree assembly dropped from 350 ms to 36 ms on 50 thousand files with an indexed build through a lookup map instead of repeated tree search",
  "changelog.5_0_0.changed.app.date_fns":
    "date-fns removed in favor of a built-in relative time replacement that measures 4.6 times faster at 1.56M against 340K operations per second",
  "changelog.5_0_0.changed.torrents.magnet_dedup":
    "Concurrent magnet resolutions for the same release share one request, so there are no duplicate network calls",
  "changelog.5_0_0.changed.torrents.metadata_timeout":
    "Magnet metadata wait extended from 30 to 120 seconds for slow seeders, dead fallback trackers replaced, and a dedicated preparing state with an elapsed timer",
  "changelog.5_0_0.changed.anilist.stats_tabs":
    "Statistics window split into Overview, Calendar, and Released tabs",
  "changelog.5_0_0.changed.anilist.toolbar": "AniList toolbar collapsed into an overflow menu",
  "changelog.5_0_0.changed.anilist.more_menu":
    "AniList overflow menu now uses the shared collection dropdown style with grouped actions and an explicit scroll or pagination choice",
  "changelog.5_0_0.changed.anilist.nsfw":
    "Adult content renamed to NSFW across filters and settings with a red highlight",
  "changelog.5_0_0.changed.search.pager":
    "Search pager no longer offers a next page after an empty result and steps back automatically",
  "changelog.5_0_0.changed.search.session_timeout":
    "Source session checks time out after 8 seconds instead of hanging the search",
  "changelog.5_0_0.changed.player.open_perf":
    "Native player window opens in under 0.5 seconds with zero dropped frames on the test set with a separate lightweight window",
  "changelog.5_0_0.changed.player.filename_parser":
    "Local filename parser replaces anitomy: years stay years instead of episode numbers, season tags leave titles, release groups and episode names survive, and folder names help number-prefixed files",
  "changelog.5_0_0.changed.torrents.instant_remove":
    "Torrent removal is instant: the row disappears at once while the engine catches up in the background, with a three button confirm dialog",
  "changelog.5_0_0.changed.app.hotkeys_registry":
    "Keyboard shortcuts moved to a shared registry: player keys, tab switching, screenshots, and windows share one check, so response stays instant and layout independent",
  "changelog.5_0_0.changed.search.pacing":
    "Search, player, and preview inputs share one timing engine for delayed and rate-limited updates",
  "changelog.5_0_0.fixed.anilist.save_casing":
    "List entry saves failed on inconsistent field name spelling, now the spelling is unified",
  "changelog.5_0_0.fixed.torrents.infohash_casing":
    "Tracker add and remove were broken by inconsistent release hash spelling, now the spelling is unified",
  "changelog.5_0_0.fixed.player.track_switch":
    "Audio and subtitle track switching failed on a wrong command format, now tracks switch",
  "changelog.5_0_0.fixed.anilist.site_query":
    "Site notifications failed to load on a wrong request, the request is fixed",
  "changelog.5_0_0.changed.app.state_engine":
    "Reworked internal state handling so lists, the player, and settings react faster",
  "changelog.5_0_0.changed.search.did_you_mean_highlight":
    "Did-you-mean suggestions now highlight what changed in the correction",
  "changelog.5_0_0.changed.search.spell_quickfix":
    "Spell quick-fix card in search fields: the typo popup shows the correction with buttons, Tab applies it while typing and Ctrl+Tab saves the word to the personal dictionary",
  "changelog.5_0_0.changed.search.spell_menu":
    "Spell corrections moved into the suggestion dropdown as their own section, with a standalone panel when the dropdown is off: up to three variants to pick from and one Tab for everything",
  "changelog.5_0_0.fixed.search.spell_overlap":
    "The correction popup no longer covers the first suggestion rows or gets clipped in half on narrow inputs",
  "changelog.5_0_0.changed.anilist.progress_blocks":
    "Episode progress bars always show 12 blocks of equal width, so short and long series look the same and the bar fills fully only on the last episode",
  "changelog.5_0_0.changed.settings.theme_cleanup":
    "Theme list trimmed from 24 to 14, night theme now defaults to Tokyo Night",
  "changelog.5_0_0.fixed.player.resume_jump":
    "Resume playback no longer stutters: the player seeks to the position once instead of twice, and position and duration are read live instead of stale data",
  "changelog.5_0_0.fixed.player.timeline_flicker":
    "The timeline no longer jumps to zero while paused.",
  "changelog.5_0_0.fixed.player.remaining_toggle":
    "The timeline time works with the keyboard now: it is a real button with a hint, toggles elapsed and remaining, and stays elapsed when the duration is unknown",
  "changelog.5_0_0.fixed.app.scan_db_locked":
    "The database-is-locked scan failure no longer appears when opening the player: writes now proceed strictly one at a time",
  "changelog.5_0_0.changed.player.hot_paths":
    "Player hot paths are faster: queue sorting, track menus, language names, and preview card order",
  "changelog.5_0_0.changed.collection.short_query":
    "Collection short search answers in under a millisecond on a 10 thousand item library instead of up to 20 milliseconds: first keystrokes and operator tags no longer stall the list",
  "changelog.5_0_0.changed.search.scoring_work":
    "Search suggestions do roughly half the text normalization work per keystroke and allocate less garbage, so the dropdown stays smooth on large anime lists",
  "changelog.5_0_0.changed.app.parse_cache":
    "Filename parse cache quadrupled to 8000 entries, so rescans of large libraries reuse parsed names instead of parsing every file again",
  "changelog.5_0_0.changed.search.result_card":
    "Search results use the redesigned card: a big cover thumbnail that refreshes the picture on click, the seed bar, and the shared toolbar. Details open from the title",
  "changelog.5_0_0.changed.search.details_modal":
    "The torrent details modal is rebuilt around a poster plus full metadata and tabs for screenshots, file tree, mediainfo, and comments",
  "changelog.5_0_0.changed.search.cover_cache":
    "Torrent covers resolve from a persistent cache: the second view of a title and season shows the picture with no requests, different spellings of one anime share one entry, and the season match no longer shows season 1 on a season 2 release. Click the thumbnail to drop the entry and resolve again",
  "changelog.5_0_0.changed.search.spell_prewarm":
    "The typo dictionary builds in the background while the app is idle and persists between runs, so the first did-you-mean lookup is instant",
  "changelog.5_0_0.changed.search.anime_index":
    "The anime index that powers search suggestions and typo checks builds at startup instead of only after the AniList tab is opened, and it re-syncs to the database only when it actually changed",
  "changelog.5_0_0.changed.torrents.files_batch":
    "A page of torrents loads the file lists in one call instead of one call per torrent",
  "changelog.5_0_0.changed.player.parser_folders":
    "The filename parser reads rutracker release folders: TV-2 style markers set the season, 12 of 12 counts stay counts, and comma or plus separated brackets split",
  "changelog.5_0_0.changed.search.normalize":
    "Search text cleanup now runs as a single pass, about twice as fast on large title lists, so the suggestion dropdown answers sooner while typing",
  "changelog.5_0_0.changed.search.input_latency":
    "Search fields wait for a pause before asking the database and skip one-letter queries, so typing no longer floods lookups and the list settles instead of flickering",
  "changelog.5_0_0.changed.search.spell_words":
    "Spellcheck underlines every misspelled word now, and Tab fixes the word under the cursor instead of the whole query at once",
  "changelog.5_0_0.changed.collection.filter_worker":
    "Collection filtering moved to a background thread, so typing in a large library no longer stalls the list",
  "changelog.5_0_0.changed.player.ipc_quiet":
    "Quieter player backend chatter: volume sends once per change with a drag throttle, settings sliders resend only changed properties, file setup is a single call, and playlist actions read the list once",
  "changelog.5_0_0.fixed.player.video_margins":
    "Video no longer slides under the bottom bar: margins resend after startup and on every playback restart, and failed sends retry instead of sticking",
  "changelog.5_0_0.fixed.player.scrub_jumps":
    "Timeline scrubbing no longer jumps back after drop: the target clears only on a fresh position or a double confirmation.",
  "changelog.5_0_0.fixed.player.scan_busy":
    "Saved folder scans no longer fail with a thread-pool error: folders scan one at a time with automatic retry, and unreadable files are skipped instead of aborting the whole scan",
  "changelog.5_0_0.fixed.torrents.magnet_source":
    "Switching search tabs while a magnet loads no longer downloads from the wrong tracker: the magnet uses the source of the shown results",
  "changelog.5_0_0.fixed.player.parser_ranges":
    "Filename parser reads episode ranges like 133-134 and 01 ~ 12, roman-numbered seasons, and more studio and language spellings",
  "changelog.5_0_0.fixed.search.wallpaper_loader":
    "Modern search tab no longer sticks on the loader when the wallpaper is missing: it falls back to the bundled image and reports load failures instead of hanging silently",
  "changelog.5_0_0.fixed.player.prev_button":
    "Previous file button always reported the first file because the playlist position never arrived from the player; it now follows the real queue position and switches files",
  "changelog.5_0_0.changed.player.scan_batch":
    "Folder scans run as a single batched pass with per-folder progress, and the folder tree builds faster on large libraries",
  "changelog.5_0_0.changed.search.spell_stable":
    "Spellcheck underlines every typo at once without flickering while you type, ignores roman numerals like II and III, and warms up in the background so the first correction is instant",
  "changelog.5_0_0.changed.anilist.stepper":
    "AniList progress stepper survives rapid taps: the last target wins, a failed save restores the confirmed value and offers retry, and save errors show the server reason in the stepper and the list editor",
  "changelog.5_0_0.changed.player.title_arc":
    "Player title shows the story arc as Title: Arc next to season and episode",
  "changelog.5_0_0.changed.player.parser_versions":
    "Filename parser reads release versions like 01v2 and 01 (v2): the version lands on the episode, and names after versioned numbers survive as episode titles",
  "changelog.5_0_0.fixed.player.parser_roman_dedup":
    "Search titles no longer repeat a season already written in roman numerals: Overlord IV stays Overlord IV instead of gaining 4th Season",
  "changelog.5_0_0.fixed.player.parser_subtitle_langs":
    "Subtitle language tags like POR-BR and SPA-LA no longer leak into anime titles",
  "changelog.5_0_0.fixed.search.cover_flash":
    "Remote covers no longer flash the placeholder file while the bytes download; the fallback picture appears only when a cover cannot be resolved at all",
  "changelog.5_0_0.fixed.collection.import_lock":
    "Collection import no longer fails with a database-is-locked error after half a minute and loses part of the items: the import command asked for the app data write lock it was already holding and timed out against itself",
  "changelog.5_0_0.fixed.search.socks_remote_dns":
    "SOCKS proxies now resolve tracker and API hostnames through the proxy for search, AniList, TMDB, and covers instead of resolving DNS locally",
} as const;

export default changelog500;
