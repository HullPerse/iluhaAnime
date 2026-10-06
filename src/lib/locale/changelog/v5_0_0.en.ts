const changelog500 = {
  "changelog.5_0_0.added.player.native_player":
    "Built-in mpv player in a separate window: classic skin, play and pause, seeking, audio and subtitle tracks, jump to time, cheat sheet, and a persistent playlist sidebar with a queue manager",
  "changelog.5_0_0.added.player.profiles":
    "Player profiles Basic, Speed and Quality, hardware decoding settings, HDR tone mapping controls, and loudness normalization",
  "changelog.5_0_0.added.player.osd":
    "Live diagnostics overlay with fps, dropped frames, cache and decoder state, plus a watchdog toast when frames start dropping",
  "changelog.5_0_0.added.player.hover_preview":
    "Timeline hover previews rendered by live mpv with a disk cache: warm thumbs take 16 to 55 ms against 179 to 320 ms with ffmpeg, and a click on the time toggles elapsed and remaining",
  "changelog.5_0_0.added.player.eof":
    "End of file behavior setting: do nothing, pause at the end, play the next file, or repeat",
  "changelog.5_0_0.added.player.categories":
    "Category import and export for the player library",
  "changelog.5_0_0.added.player.playlist_dnd":
    "Playlist drag and drop reorder, prefetch of the next file, and virtualization past 50 rows",
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
  "changelog.5_0_0.added.settings.theme_schedule":
    "Day and night theme scheduler: the theme switches automatically by local time",
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
  "changelog.5_0_0.changed.anilist.batch_fetch":
    "AniList list, score, and media fetching goes through a 3 request semaphore with alias batching in anilist batch.rs, so collections and friend data load in fewer round trips",
  "changelog.5_0_0.changed.search.scoring_unify":
    "Search suggestion scoring now uses the same day, week, and month steps as the SQL ranking, so suggestions and history agree",
  "changelog.5_0_0.changed.search.fts_startup":
    "Full text index optimization moved to a background thread at startup",
  "changelog.5_0_0.changed.app.folder_scan":
    "Folder scans use jwalk instead of walkdir, and the folder watcher coalesces event bursts with notify-debouncer-mini on a 1 second window",
  "changelog.5_0_0.changed.player.tree_build":
    "Player folder tree assembly dropped from 350 ms to 36 ms on 50 thousand files",
  "changelog.5_0_0.changed.app.date_fns":
    "date-fns removed in favor of an in-house relative time port that measures 4.6 times faster at 1.56M against 340K operations per second",
  "changelog.5_0_0.changed.torrents.magnet_dedup":
    "Concurrent magnet resolutions for the same topic share one request through the magnetInflight map",
  "changelog.5_0_0.changed.torrents.metadata_timeout":
    "Magnet metadata wait extended from 30 to 120 seconds, dead fallback trackers replaced, and a dedicated initializing state with an elapsed timer",
  "changelog.5_0_0.changed.anilist.stats_tabs":
    "Statistics window split into Overview, Calendar, and Released tabs",
  "changelog.5_0_0.changed.anilist.toolbar":
    "AniList toolbar collapsed into an overflow menu",
  "changelog.5_0_0.changed.anilist.nsfw":
    "Adult content renamed to NSFW across filters and settings with a red highlight",
  "changelog.5_0_0.changed.search.pager":
    "Search pager no longer offers a next page after an empty result and steps back automatically",
  "changelog.5_0_0.changed.search.session_timeout":
    "Source session checks time out after 8 seconds instead of hanging the search",
  "changelog.5_0_0.changed.player.open_perf":
    "Native player window opens in under 0.5 seconds with zero dropped frames on the benchmark corpus",
  "changelog.5_0_0.changed.torrents.instant_remove":
    "Torrent removal is instant with a three button confirm dialog",
  "changelog.5_0_0.fixed.anilist.save_casing":
    "List entry saves failed on field name casing of media_id against mediaId",
  "changelog.5_0_0.fixed.torrents.infohash_casing":
    "Tracker add and remove were broken by infoHash against info_hash casing across the torrent client",
  "changelog.5_0_0.fixed.player.track_switch":
    "Audio and subtitle track switching wrote numeric values where mpv expects strings",
} as const;

export default changelog500;
