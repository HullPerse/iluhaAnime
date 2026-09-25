const changelog412 = {
  "changelog.4_1_2.added.friend_compare":
    "Friends modal compares your lists with a friend: iluha affinity score, shared and unique titles with score gaps, top shared genres and shared favourites",
  "changelog.4_1_2.added.franchise_focus":
    "Switching the franchise section to graph centers on the current anime, with a To current button to jump back to it",
  "changelog.4_1_2.added.anilist_loader_timer":
    "The AniList loader shows elapsed seconds, and after 10 seconds suggests a proxy (Settings > General > AniList proxy)",
  "changelog.4_1_2.added.collection_operators":
    "Collection search understands the same operators, with syntax hints appearing once a marker is typed",
  "changelog.4_1_2.added.screenshots_save":
    "Then pick the folder, file name and PNG or JPEG format, copy the shot without saving, and open the folder right after saving",
  "changelog.4_1_2.added.score_formats":
    "Scores follow your AniList system: 100 points, 10 with decimals, plain 10, 5 stars, or 3 smileys - shown with your denominator everywhere, converted on import into the collection",
  "changelog.4_1_2.added.franchise_status":
    "Franchise lists show your status square and episode progress on every row, including the current anime",
  "changelog.4_1_2.added.wizard_dropdown":
    "Collection search is one dropdown with up to 6 results: covers, type and year badges, full keyboard control, and covers loading through the image cache",
  "changelog.4_1_2.added.wizard_save_loader":
    "The Save button spins while the cover and the credits finish loading, so a slow network no longer looks stuck",
  "changelog.4_1_2.added.rutracker_proxy_login":
    "Rutracker sign-in opens the site window through your proxy, with the proxy password filled in by itself",
  "changelog.4_1_2.added.score_origin_hint":
    "Adding an AniList title to the collection carries your score over as the collection rating and shows where it came from: 85/100 becomes 8.5 with the original next to the field",
  "changelog.4_1_2.added.offline_mode":
    "Without a network, Search and AniList tabs disable with an icon, background checks pause, and a notice arrives when the connection drops or comes back",
  "changelog.4_1_2.added.airing_countdown":
    "The next episode line shows the local date and time with a live countdown, and the release calendar shows the local time of every release",
  "changelog.4_1_2.added.old_entry_date":
    "List entries too old for AniList dates show More than 5 years ago instead of an empty slot",
  "changelog.4_1_2.changed.color_presets":
    "Color presets are gone from the screenshot toolbar and the color picker: pick any color directly",
  "changelog.4_1_2.changed.sqlite_console_removed":
    "The SQL console is gone from the SQLite browser: it saw no real use, and the browse view with filters covers everyday inspection",
  "changelog.4_1_2.changed.suggestion_perf":
    "Suggestion scan skips per-item allocations and equal scores prefer shorter titles: short queries run ~20-30% faster",
  "changelog.4_1_2.changed.friend_status_square":
    "Friend score rows show the list status as a color square with a tooltip instead of a text strip",
  "changelog.4_1_2.changed.rutracker_cookies":
    "The cookie-paste tab is gone from the rutracker login: the site window is the way in",
  "changelog.4_1_2.changed.score_hint":
    "A score that does not fit your AniList format now says what is expected instead of telling you it does not fit: whole numbers from 0 to 100, 0 to 10 with one decimal, 0 to 5, 0 to 3",
  "changelog.4_1_2.changed.friends_scores_batch":
    "Friends' scores load in one request instead of two for every friend, so the section opens faster and presses less on the AniList rate limit",
  "changelog.4_1_2.changed.sequential_off_empty":
    "The sequential download button is an empty box again when off, with a check mark when on",
  "changelog.4_1_2.changed.indicator_heights":
    "Progress bars and status dots are thicker across torrents, collection, friends and player, so they no longer get lost next to the buttons",
  "changelog.4_1_2.fixed.tmdb_key_save":
    "The TMDB key saves again: the app and the backend disagreed on the field name",
  "changelog.4_1_2.fixed.tmdb_covers":
    "TMDB search results show their posters again: the app read a field name the backend never sent, so every row fell back to the first letter of the title",
  "changelog.4_1_2.fixed.wizard_cover_lookup":
    "A search result that comes back without a poster now has its cover requested by title behind the scenes, so the row and the preview show a real cover instead of a letter, and it is kept in the image cache",
  "changelog.4_1_2.fixed.tmdb_metadata":
    "Picking a TMDB result fills in the release date again, and the stills and trailer lookup finds the movie instead of quietly falling through to MAL - the same field-name mismatch",
  "changelog.4_1_2.fixed.mean_score_format":
    "The average score in your header and in friend previews is shown on your own scale (8.5/10, 85/100) instead of as a bare number",
  "changelog.4_1_2.fixed.quickadd_score_format":
    "Quick add converts the score with the format you are actually using: it used to read the format out of the cache at click time and could carry over the wrong rating",
} as const;

export default changelog412;
