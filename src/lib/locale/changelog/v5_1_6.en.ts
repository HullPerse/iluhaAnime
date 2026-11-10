const changelog516 = {
  "changelog.5_1_6.fixed.anilist.new_entry":
    "Adding a title that is not in any list no longer fails: the status is empty by default, and untouched progress and score are not sent to AniList as null",
  "changelog.5_1_6.fixed.anilist.error_details":
    "AniList save errors now show the reason from the response, and client errors are no longer retried three times",
  "changelog.5_1_6.fixed.search.logout":
    "Signing out of RuTracker, nekoBT and Erai-Raws updates the toolbar immediately instead of waiting for the session checks",
  "changelog.5_1_6.fixed.player.ffmpeg_delete":
    "The FFmpeg delete button removes the downloaded copy, and names a system FFmpeg from PATH instead of failing silently",
} as const;

export default changelog516;
