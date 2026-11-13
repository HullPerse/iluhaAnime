const changelog320 = {
  "changelog.3_2_0.added.upscale_cascade":
    "Anime4K: always-on deband and automatic 2x to 2x cascade",
  "changelog.3_2_0.added.upscale_preview":
    "Upscale frame preview filmstrip with before/after compare",
  "changelog.3_2_0.added.upscale_realcugan": "RealCUGAN-SE as a second AI upscaler",
  "changelog.3_2_0.added.upscale_suggest":
    "Automatic upscale preset suggestion from frame analysis",
  "changelog.3_2_0.added.upscale_codec": "HEVC and 10-bit output options",
  "changelog.3_2_0.added.upscale_rife": "RIFE frame interpolation",
  "changelog.3_2_0.added.upscale_temporal": "Temporal denoise option for Anime4K chains",
  "changelog.3_2_0.added.upscale_eta": "Time estimation for upscale jobs",
  "changelog.3_2_0.added.stills": "Anime stills showcase (TMDB backdrops, Jikan fallback)",
  "changelog.3_2_0.added.trailer": "In-app trailers in anime details and collection items",
  "changelog.3_2_0.added.media_db": "Stills and trailers stored in the collection database",
  "changelog.3_2_0.added.jobcenter":
    "Task center in the status bar with a unified progress pattern",
  "changelog.3_2_0.added.queue": "Player queue on top with per-file depth steps and a bottom strip",
  "changelog.3_2_0.added.scan_task": "Folder scan as a task row inside the queue panel",
  "changelog.3_2_0.added.folder_resize": "Resizable saved folder panels in the player",
  "changelog.3_2_0.added.torrent_states":
    "Five torrent states with colors, stall detection, error alerts",
  "changelog.3_2_0.added.chips": "Quick filter chips under the torrent search bar",
  "changelog.3_2_0.added.bridge":
    "One-click add from AniList to the collection with status mapping",
  "changelog.3_2_0.added.prefetch_resume": "Background relation prefetch with resume after restart",
  "changelog.3_2_0.added.summary": "Settings summary rail: version, binaries, backups, learning",
  "changelog.3_2_0.added.changelog_tab": "This changelog tab",
  "changelog.3_2_0.added.import_modes": "AniList import: summary, sync mode, metadata backfill",
  "changelog.3_2_0.added.friends_activity": "Friends latest activity rows",
  "changelog.3_2_0.added.favorites": "Favorites core collection status",
  "changelog.3_2_0.added.proxies": "Per-source proxies for login, sessions, and downloads",
  "changelog.3_2_0.added.notifications_lists":
    "AniList release notifications per list with interval",
  "changelog.3_2_0.added.sqlite_views":
    "SQLite browser: virtual scroll, display modes, backup panel",
  "changelog.3_2_0.added.search_tags": "Search tag operators: OR lists, sort, progress, episodes",
  "changelog.3_2_0.added.backfill": "Manual embedding backfill button",
  "changelog.3_2_0.added.github": "Project links in the status bar",
  "changelog.3_2_0.changed.settings_layout":
    "Settings rebuilt as master-detail with a summary rail",
  "changelog.3_2_0.changed.toasts":
    "Toast popups removed; tray plus optional system popups instead",
  "changelog.3_2_0.changed.shikimori": "Shikimori integration removed",
  "changelog.3_2_0.changed.vault": "Vault tab removed",
  "changelog.3_2_0.changed.duplicates":
    "Duplicate merge removed; warn-only hint stays in the wizard",
  "changelog.3_2_0.changed.activity_button": "Single activity button opening on the feed tab",
  "changelog.3_2_0.changed.anilist_tabs": "AniList list tabs moved onto the shared tab control",
  "changelog.3_2_0.fixed.fts": "Collection status change no longer fails with an SQL logic error",
  "changelog.3_2_0.fixed.activity_modal": "Activity modal no longer opens on its own",
  "changelog.3_2_0.fixed.eye": "Duplicate system password-reveal icon suppressed",
  "changelog.3_2_0.fixed.lost_update": "Collection edits no longer overwrite each other",
  "changelog.3_2_0.fixed.updated_at": "Fixed sort order after editing collection items",
  "changelog.3_2_0.fixed.cloudflare": "Cloudflare challenge detection and honest connection tests",
  "changelog.3_2_0.fixed.search_hang":
    "Torrent search fails fast instead of hanging on bad proxies",
} as const;

export default changelog320;
