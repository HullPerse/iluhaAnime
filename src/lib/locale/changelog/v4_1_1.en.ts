const changelog411 = {
  "changelog.4_1_1.added.smart_resume":
    "Resuming a paused torrent notices when another client wrote to the same files and re-verifies them from disk instead of trusting a stale bitmap",
  "changelog.4_1_1.added.paused_watch":
    "A paused torrent shows a live badge when its files change outside the app, so the re-verification is visible before you resume",
  "changelog.4_1_1.added.paused_changed_names":
    "The external-changes badge names the exact files another client rewrote",
  "changelog.4_1_1.added.paused_recheck":
    "The badge has a Recheck now button that re-verifies the files from disk while the torrent stays paused",
  "changelog.4_1_1.added.tray":
    "A tray icon with a menu of the open tabs plus Quit, and an option to minimize to tray on close so downloads keep running",
  "changelog.4_1_1.added.native_toasts":
    "Native Windows toasts report their click back: an anime notification opens its card, a torrent one opens the download folder",
  "changelog.4_1_1.added.notification_targets":
    "Notification rows open what they are about, with the keyboard working too, and the panel dedupes repeats instead of stacking them",
  "changelog.4_1_1.added.file_order_setting":
    "A File order setting decides what the list shows first and what sequential download starts with: as listed, or as stored in the torrent",
  "changelog.4_1_1.added.torrent_queue":
    "Download queue: arrange the files you picked by dragging them, and sequential mode fetches them in exactly that order",
  "changelog.4_1_1.added.torrent_queue_drag":
    "In the manual order the torrents themselves can be rearranged by dragging a row by its handle, not only with the arrows",
  "changelog.4_1_1.added.torrent_proxy":
    "A SOCKS5 proxy setting for peer connections and HTTP trackers, with a connection test and the port the session actually bound; DNS resolves through the proxy as well, and the rutracker file list loads through it instead of the direct path",
  "changelog.4_1_1.added.screenshots":
    "CTRL+SHIFT+P captures the open page into a screenshot window: mark the area right on the preview (Shift - square), zoom and move the shot with the wheel and the right button",
  "changelog.4_1_1.added.screenshots_save":
    "Then pick the folder, file name and PNG or JPEG format, copy the shot without saving, and open the folder right after saving",
  "changelog.4_1_1.added.screenshot_draw":
    "The screenshot window can mark up what it captured before saving: a pencil with a color palette or a color of your own, an eraser, text that you can drag, retype or resize, and a blur brush that hides what should not leave the app, with undo and redo on Ctrl+Z and Ctrl+Y",
  "changelog.4_1_1.added.browser_login":
    "AniList login from the browser: confirm once on the site and the app picks up the token itself, with manual paste kept as a fallback",
  "changelog.4_1_1.added.friend_comments":
    "Friend scores show the friend's list comment behind a bubble button; rows without a comment show nothing",
  "changelog.4_1_1.added.friend_rewatch":
    "Friend scores mark repeated watches with a rewind icon carrying the repeat count",
  "changelog.4_1_1.added.list_comment":
    "List management edits your own list comment: view it, change it, or clear it with an empty field",
  "changelog.4_1_1.added.screenshot_modal":
    "Screenshots fire with a modal open: the capture includes it and the screenshot window lands on top",
  "changelog.4_1_1.added.search_operators":
    "Search understands fzf-style operators: ^prefix, suffix$, 'exact, !exclusion, with space-separated terms all required",
  "changelog.4_1_1.added.collection_operators":
    "Collection search understands the same operators, with syntax hints appearing once a marker is typed",
  "changelog.4_1_1.added.app_site": "App website: https://iluhasite.onrender.com/",
  "changelog.4_1_1.changed.resume_notice":
    "A resume that had to re-verify the files reports what it found in a notification instead of finishing silently",
  "changelog.4_1_1.changed.rewrite_ghost":
    "Re-checking a torrent or changing its limits no longer makes its row blink out of the list: the old row stands in until the torrent is back, and the old and the new one are never shown together",
  "changelog.4_1_1.changed.file_selection":
    "A file is checked and unchecked in one place again: the checkbox sets its priority, folders have one of their own, and the separate Normal/Skip dropdown is gone",
  "changelog.4_1_1.changed.bulk_buttons":
    'The global "Pause all" and "Resume all" buttons are gone: tick the rows and use the action bar instead',
  "changelog.4_1_1.changed.errors_recheck":
    '"Retry errors" became "Recheck errors": it checks the files first, and recreating is offered only after a check proves they are still missing',
  "changelog.4_1_1.changed.recreate_confirm":
    "Recreating a torrent now says outright that manual trackers, the file selection and priorities are lost",
  "changelog.4_1_1.changed.torrent_speed":
    "Torrent traffic can now be routed through a SOCKS5 proxy, so an ISP throttle on unencrypted BitTorrent stops hitting at full strength",
  "changelog.4_1_1.fixed.tray_restore":
    "The tray icon always shows up now and a left click brings the window back: earlier the icon could be blank and the restore was blocked by missing window permissions",
  "changelog.4_1_1.fixed.text_cursor":
    "Hovering a placed text inside the selected screenshot area flips the frame cursor, so the drag visibly carries the text",
  "changelog.4_1_1.changed.color_presets":
    "Color presets are gone from the screenshot toolbar and the color picker: pick any color directly",
  "changelog.4_1_1.changed.suggestion_perf":
    "Suggestion scan skips per-item allocations and equal scores prefer shorter titles: short queries run ~20-30% faster",
  "changelog.4_1_1.added.score_formats":
    "Scores follow your AniList system: 100 points, 10 with decimals, plain 10, 5 stars, or 3 smileys - shown with your denominator everywhere, converted on import into the collection",
  "changelog.4_1_1.added.franchise_status":
    "Franchise lists show your status square and episode progress on every row, including the current anime",
  "changelog.4_1_1.added.wizard_dropdown":
    "Collection search is one dropdown with up to 6 results: covers, type and year badges, full keyboard control, and covers loading through the image cache",
  "changelog.4_1_1.added.wizard_save_loader":
    "The Save button spins while the cover and the credits finish loading, so a slow network no longer looks stuck",
  "changelog.4_1_1.added.rutracker_proxy_login":
    "Rutracker sign-in opens the site window through your proxy, with the proxy password filled in by itself",
  "changelog.4_1_1.changed.friend_status_square":
    "Friend score rows show the list status as a color square with a tooltip instead of a text strip",
  "changelog.4_1_1.changed.rutracker_cookies":
    "The cookie-paste tab is gone from the rutracker login: the site window is the way in",
  "changelog.4_1_1.fixed.tmdb_key_save":
    "The TMDB key saves again: the app and the backend disagreed on the field name",
} as const;

export default changelog411;
