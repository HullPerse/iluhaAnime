const changelog520 = {
  "changelog.5_2_0.added.collection.cards":
    "Collection is now card-based: packs for completed anime, cards of titles, characters, staff and studios with a rarity and three finish variants, a grid and 4x3 binder album, per-title collections and a shop with six pack kinds",
  "changelog.5_2_0.added.collection.starter":
    "Starter packs behind a button in the Collection navigation: one to five packs based on the number of completed titles, once per AniList profile",
  "changelog.5_2_0.added.collection.gifts":
    "Card gifts over a one-time link: the recipient confirms with a receipt link, and deleting an unclaimed gift returns a copy of the card",
  "changelog.5_2_0.added.game.daily":
    "The iluhaGuesser daily game: guess the anime from six frames, an opening or a 15-second clip, every won mode grants a pack, and the streak and history stay local",
  "changelog.5_2_0.added.news.tab":
    "A news tab sourced from Shikimori: post text, images, inline YouTube and VK video, pagination and an AniList title redirect by MAL id",
  "changelog.5_2_0.changed.settings.proxy_cards_daily":
    "Separate proxies for card images and the daily game: an empty field inherits the shared AniList proxy, so existing settings keep working",
  "changelog.5_2_0.changed.torrents.rename_folder":
    "Renaming a torrent now renames its root folder on disk, single-file torrents only change the display name, and clearing the name restores the previous folder",
  "changelog.5_2_0.changed.app.bundle":
    "Large libraries and changelog strings moved into separate chunks: the initial load is smaller and the over-500 KB chunk warning is gone",
  "changelog.5_2_0.fixed.anilist.new_entry":
    "A new title appears in the AniList list immediately after saving instead of waiting for the list to reload",
  "changelog.5_2_0.fixed.app.select":
    "Fixed font rendering in dropdowns and the hover text colour of the selected option",
} as const;

export default changelog520;
