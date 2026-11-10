const changelog514 = {
  "changelog.5_1_4.fixed.torrents.covers_build":
    "Torrent search covers show again after a build: with a saved AniList session the automatic cover mode is applied on startup, not only after signing in again",
  "changelog.5_1_4.fixed.search.logout":
    "Signing out of RuTracker, nekoBT and Erai-Raws updates the toolbar immediately instead of waiting for the session checks",
  "changelog.5_1_4.fixed.player.ffmpeg_delete":
    "The FFmpeg delete button removes the downloaded copy, and names a system FFmpeg from PATH instead of failing silently",
} as const;

export default changelog514;
