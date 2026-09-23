const changelog410 = {
  "changelog.4_1_0.added.torrent_create":
    "Create a .torrent from any folder and seed it from where the files already are, without copying or downloading anything again",
  "changelog.4_1_0.added.torrent_create_link":
    'A created torrent shows its iluhaanime:// link with a copy button and a "Save .torrent" action',
  "changelog.4_1_0.added.torrent_select":
    "Torrents can be ticked with a checkbox and acted on together from a bar under the list",
  "changelog.4_1_0.added.torrent_missing":
    "Torrents whose files are gone from disk get their own amber state, with the reason and a Recheck button",
  "changelog.4_1_0.added.overlay_escape":
    "One Escape closes only the top-most window, even when a confirm sits on top of a modal",
  "changelog.4_1_0.added.host_bars": "CPU, RAM and network mini-bars in the torrent summary",
  "changelog.4_1_0.added.color_picker":
    "New colour picker: a saturation/brightness area, a hue strip, HEX/RGB/HSL fields and the app palette",
  "changelog.4_1_0.added.animated_counters":
    "Animated download and upload counters in the torrent summary, switchable in Effects",
  "changelog.4_1_0.added.characters_window":
    "Characters, their voice actors and the anime they share open inside one window, with a back arrow",
  "changelog.4_1_0.added.character_cards":
    "Character and voice actor cards show the role, favourite count, bio and a link to AniList",
  "changelog.4_1_0.added.character_tiles":
    "Character and staff tiles are bigger, keep their names on one baseline and light up on hover",
  "changelog.4_1_0.added.voice_actor_preview":
    "Hovering a character in an anime shows the people who voiced them, and clicking one opens that voice actor's profile",
  "changelog.4_1_0.added.friends_preview":
    "Clicking a friend shows a preview with their last five activities on the right, and the List button opens their full lists",
  "changelog.4_1_0.added.detail_posters":
    "Friend scores and similar anime use the same poster tiles as the rest of the app, without empty label rows",
  "changelog.4_1_0.added.torrent_queue":
    "Download queue: arrange the files you picked by dragging them, and sequential mode fetches them in exactly that order",
  "changelog.4_1_0.added.torrent_queue_drag":
    "In the manual order the torrents can be rearranged by dragging a row by its handle, not only with the arrows",
  "changelog.4_1_0.changed.file_selection":
    "A file is checked and unchecked in one place again: the checkbox sets its priority, folders have one of their own, and the separate Normal/Skip dropdown is gone",
  "changelog.4_1_0.changed.bulk_buttons":
    'The global "Pause all" and "Resume all" buttons are gone: tick the rows and use the action bar instead',
  "changelog.4_1_0.changed.errors_recheck":
    '"Retry errors" became "Recheck errors": it checks the files first, and recreating is offered only after a check proves they are still missing',
  "changelog.4_1_0.changed.recreate_confirm":
    "Recreating a torrent now says outright that manual trackers, the file selection and priorities are lost",
  "changelog.4_1_0.fixed.tracker_ipc":
    "Adding or removing a tracker in the peer modal no longer fails on a mismatched command argument",
  "changelog.4_1_0.fixed.anilist_pages":
    "AniList search asks for the requested page size instead of a silent twenty-by-three",
  "changelog.4_1_0.fixed.staff_flash":
    "Opening a voice actor no longer shows the character's card while the profile is still loading",
  "changelog.4_1_0.fixed.detail_paging":
    "Character, voice actor and similar lists no longer hide everything past the first page",
  "changelog.4_1_0.fixed.staff_profile":
    "A voice actor's profile opens instead of failing with an AniList error",
  "changelog.4_1_0.fixed.staff_paging":
    "A voice actor's character and anime lists page in full instead of stopping after the first page",
} as const;

export default changelog410;
