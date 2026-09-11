const changelog400 = {
  "changelog.4_0_0.added.modern_tab":
    "Modern search tab with a dithering wallpaper lab",
  "changelog.4_0_0.added.dither_presets":
    "Dither presets, palettes, and from-image color extraction",
  "changelog.4_0_0.added.wallpaper_fx":
    "Wallpaper parallax, scanlines overlay, and CRT bake preset",
  "changelog.4_0_0.added.spotlight":
    "Anime spotlight of the day, week, and month with refresh countdown",
  "changelog.4_0_0.added.random_menu":
    "Random item picker in the collection data menu",
  "changelog.4_0_0.added.random_filters":
    "Random anime picker from AniList filters",
  "changelog.4_0_0.added.deeplinks":
    "Shareable iluhaanime:// anime links with a copy button",
  "changelog.4_0_0.added.release_dates":
    "Release dates end to end: wizard, refresh, quick-add, import",
  "changelog.4_0_0.added.tag_ranges":
    "Tag ranges (year=2000...2010) and fuzzy matching (year~=2000) with tunable tolerances",
  "changelog.4_0_0.added.franchise":
    "Franchise list and Similar section in anime details",
  "changelog.4_0_0.added.fav_people":
    "Favourites for titles, staff, and characters from AniList views",
  "changelog.4_0_0.added.bilingual_labels":
    "Custom status labels in two languages",
  "changelog.4_0_0.added.descriptions":
    "Collection descriptions from AniList and TMDB",
  "changelog.4_0_0.added.filmstrip":
    "Stills filmstrip viewer inside the app",
  "changelog.4_0_0.added.fonts":
    "Global font selector with system fonts and file upload",
  "changelog.4_0_0.added.sqlite_editor":
    "SQLite browser: SQL editor with highlighting and a filter builder",
  "changelog.4_0_0.added.autocomplete":
    "Learned search suggestions with collection priority and inline ghost",
  "changelog.4_0_0.added.host_stats":
    "Host CPU, RAM, and network stats in the torrent footer and upscale panel",
  "changelog.4_0_0.changed.tag_syntax":
    "Tag syntax: `:` is no longer an operator, exact match uses `=`",
  "changelog.4_0_0.changed.anilist_tags":
    "Tags are collection-only and merge into genres",
  "changelog.4_0_0.changed.jobcenter":
    "Task center removed; queue and folder scan keep their own panels",
  "changelog.4_0_0.changed.semantic":
    "Offline semantic search removed",
  "changelog.4_0_0.changed.gif":
    "Animated GIFs no longer accepted as wallpaper",
  "changelog.4_0_0.changed.videoplayer":
    "Trailer and media playback rebuilt on the unified video player",
  "changelog.4_0_0.changed.status_ui":
    "Status strip and manager rebuilt around core and custom sections",
  "changelog.4_0_0.changed.squares":
    "AniList list tabs show collection-style status squares",
  "changelog.4_0_0.changed.tmdb_key":
    "TMDB key moved to the OS keyring with v4 token support",
  "changelog.4_0_0.changed.list_rows":
    "Collection list rows open details and show a studio/year/genres line",
  "changelog.4_0_0.changed.autopause":
    "Auto-pause fires once when a download finishes",
  "changelog.4_0_0.changed.hints":
    "Shorter UI hints across settings and modals",
  "changelog.4_0_0.changed.plurals_time":
    "Correct Russian plurals and one shared time formatter",
  "changelog.4_0_0.fixed.crash":
    "Player no longer crashes while torrent file states load",
  "changelog.4_0_0.fixed.fresh_images":
    "Images load on fresh profiles instead of failing every assets command",
  "changelog.4_0_0.fixed.status_order":
    "Custom statuses save with correct ordering, stale caches included",
  "changelog.4_0_0.fixed.files":
    "Torrent files list for every torrent with visible per-torrent errors",
  "changelog.4_0_0.fixed.quickadd":
    "Quick-add keeps the year, movie type, AniList id, and start date",
  "changelog.4_0_0.fixed.refresh_touch":
    "Metadata refresh no longer moves items in date sorting",
  "changelog.4_0_0.fixed.tmdb_covers":
    "TMDB covers load through the backend cache",
} as const;

export default changelog400;
