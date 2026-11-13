const changelog512 = {
  "changelog.5_1_2.added.player.f11":
    "F11 enters fullscreen together with interface auto-hide and restores the previous auto-hide value on exit",
  "changelog.5_1_2.changed.player.theme_clean":
    "The player window takes only the palette from the theme: grid, scanlines and titlebar art no longer draw over the video",
  "changelog.5_1_2.changed.player.escape":
    "Escape in the player no longer closes the window and only unwinds overlays and fullscreen",
  "changelog.5_1_2.changed.anilist.add_media_removed":
    'Removed the redundant "add media" button from the anime modal since the header already offers the collection wizard',
  "changelog.5_1_2.changed.collection.hidden_quickadd":
    "The quick-add button is hidden when the Collection tab is disabled in settings",
  "changelog.5_1_2.changed.player.local_index":
    "The local library index is smaller, and file search and folder updates no longer allocate a string per indexed file",
  "changelog.5_1_2.fixed.player.osd":
    "The player indicator for delays, tracks and speed now fades out on its own instead of staying until the next change",
  "changelog.5_1_2.fixed.torrents.tracker_covers":
    "Rutracker and erai-raws covers load again: images are requested with the site referer and session cookies",
  "changelog.5_1_2.fixed.anilist.score_zero":
    'Changing the status in the anime modal no longer fails without a rating: 0 now means "no score"',
  "changelog.5_1_2.fixed.collection.discard_prompt":
    "The wizard discard prompt uses distinct button labels and is no longer overlapped by the wizard tabs",
} as const;

export default changelog512;
