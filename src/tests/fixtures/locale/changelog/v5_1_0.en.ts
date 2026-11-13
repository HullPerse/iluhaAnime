const changelog510 = {
  "changelog.5_1_0.added.app.offline_banner":
    "Offline banner that explains which tabs work without a connection and what needs the internet, plus a degraded-network state with a retry action",
  "changelog.5_1_0.added.settings.proxy_test":
    "Proxy connection test in Settings with live progress, cancel and retest actions",
  "changelog.5_1_0.added.settings.cache_stats":
    "AniList and ffprobe cache hit rates shown in the Settings summary",
  "changelog.5_1_0.added.settings.sidecar_tracks":
    "Auto-load of matching sidecar tracks and scanning of subfolders for them",
  "changelog.5_1_0.added.anilist.local_filter":
    "Local filter panel in AniList with tag, studio and search controls",
  "changelog.5_1_0.added.streaming.deep_links":
    "Shareable stream links in the iluhaAnime://stream/... format and route memory for stream targets",
  "changelog.5_1_0.changed.settings.proxy":
    "Proxy settings reworked into separate sections for torrent and source proxies",
  "changelog.5_1_0.changed.torrents.proxy_coverage":
    "Torrent proxy now states its coverage and warns about SOCKS5 authentication limits",
  "changelog.5_1_0.changed.app.cache_recovery":
    "ffprobe cache evicts a quarter of entries on overflow instead of clearing, and recovers from a poisoned lock",
  "changelog.5_1_0.changed.player.chapters":
    "Chapter navigation keys now switch files when used with Shift or Ctrl",
  "changelog.5_1_0.changed.player.stream_error":
    "Stream playback errors show a dedicated hint and a retry action",
  "changelog.5_1_0.changed.streaming.details":
    "Streaming detail modal and list improvements for slow connections",
  "changelog.5_1_0.fixed.player.issues": "Fixed player playback, screenshot and control issues",
  "changelog.5_1_0.fixed.streaming.details": "Fixed streaming detail and cover loading issues",
  "changelog.5_1_0.fixed.proxy": "Fixed proxy connection and authentication issues",
} as const;

export default changelog510;
