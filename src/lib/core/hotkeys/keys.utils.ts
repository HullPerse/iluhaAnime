export const queryKeys = {
  newsFeed: (page: number, proxy: string) => ["news_feed", page, proxy] as const,
  customEmoji: () => ["custom-emoji"] as const,
  torrents: () => ["torrents"] as const,
  torrentFiles: (id: number) => ["torrent-files", id] as const,
  torrentDiagnostics: (id: number) => ["torrent_diagnostics", id] as const,
  torrentListenPort: () => ["torrent-listen-port"] as const,
  torrentActiveProxy: () => ["torrent-active-proxy"] as const,
  partialLeftovers: () => ["partial-leftovers"] as const,
  gameRoms: () => ["game-roms"] as const,
  gamePlatforms: () => ["game-platforms"] as const,
  gameStore: () => ["game-store"] as const,
  streamSearch: (query: string, page: number, filtersKey: string) =>
    ["stream_search", query, page, filtersKey] as const,
  streamConstants: () => ["stream_constants"] as const,
  streamTitle: (slug: string) => ["stream_title", slug] as const,
  streamHistoryRecent: () => ["stream_history_recent"] as const,
  streamHistoryForAnime: (animeId: string) => ["stream_history_anime", animeId] as const,
  streamHistoryProgress: (animeId: string) => ["stream_history_progress", animeId] as const,
  streamPlayers: (episodeId: string) => ["stream_players", episodeId] as const,
  streamSources: (episodeId: string, variantId: string) =>
    ["stream_sources", episodeId, variantId] as const,
  anilistEpisodePreviews: (anilistId: number) => ["anilist_episode_previews", anilistId] as const,
  anilistSession: () => ["anilist_session"] as const,
  animeFull: (id: number, proxy: string, loggedIn: boolean) =>
    ["anime_full", id, proxy, loggedIn ? 1 : 0] as const,
  animeInlineSearch: (query: string, adult: boolean) =>
    ["anime_inline_search", query, adult ? 1 : 0] as const,
  animeFranchise: (id: number) => ["franchise", id] as const,
  animeFranchiseRefresh: (id: number, refreshKey: number) =>
    [...queryKeys.animeFranchise(id), refreshKey] as const,
  animeRecommendations: (id: number) => ["anime_recommendations", id] as const,
  profileRecommendations: (userId: number | null) =>
    ["anilist_profile_recommendations", userId] as const,
  torrentDetails: (source: string, url: string, proxy: string) =>
    ["torrent_details", source, url, proxy] as const,
  torrentSource: (id: number, infoHash: string) => ["torrent_source", id, infoHash] as const,
  anilistData: () => ["anilist_data"] as const,
  anilistStatistics: (userId: number | null) => ["anilist_statistics", userId] as const,
  anilistCheckAuth: () => ["anilist_check_auth"] as const,
  anilistImportLists: (userId: number | null) => ["anilist_import_lists", userId] as const,
  anilistBrowse: (tab: string) => ["anilist_browse", tab] as const,
  anilistFollowing: (userId: number | null) => ["anilist_following", userId] as const,
  anilistSearch: (request: unknown) => ["anilist_search", request] as const,
  anilistSeasonAiring: (season: string, year: number, adult: boolean) =>
    ["anilist_season_airing", season, year, adult ? 1 : 0] as const,
  anilistSearchPages: (request: unknown) => ["anilist_search_pages", request] as const,
  friendLists: (id: number | null) => ["anilist_friend_lists", id] as const,
  friendFavourites: (id: number | null) => ["anilist_friend_favourites", id] as const,
  friendProfile: (id: number | null) => ["anilist_friend_profile", id] as const,
  friendScores: (id: number, friendsKey: string) =>
    ["anime_friend_scores", id, friendsKey] as const,
  activity: (ids: readonly number[]) => ["anilist_activity", ...ids] as const,
  activityScope: () => ["anilist_activity"] as const,
  siteNotifications: () => ["anilist_site_notifications"] as const,
  customLists: () => ["anilist_custom_lists"] as const,
  anilistListNames: () => ["anilist_list_names"] as const,

  anilistTrailer: (id: number | null, proxy: string) =>
    ["anilist_trailer", id, proxy, "v2"] as const,
  torrentSearch: (
    source: string,
    query: string,
    request: number,
    page: number,
    sort: string | null,
    direction: string | null,
    proxy: string | undefined
  ) => ["animeScraper", source, query, request, page, sort, direction, proxy ?? ""] as const,
  torrentSearchScope: () => ["animeScraper"] as const,
  torrentPoster: (pageUrl: string | null, source = "", proxy = "") =>
    ["torrent_poster", pageUrl, source, proxy] as const,
  coverResolve: (
    key: string,
    rejectedIds: number[] | null,
    learnedTitle: string | null,
    localTitle: string | null
  ) => ["cover_resolve", key, rejectedIds, learnedTitle, localTitle] as const,
  coverResolveScope: (coverKey: string) => ["cover_resolve", coverKey] as const,
  searchSessions: (rutracker: string, nekobt: string, erai: string) =>
    ["search_sessions", rutracker, nekobt, erai] as const,
  searchSessionsScope: () => ["search_sessions"] as const,
  hostStats: () => ["host-stats"] as const,
  dhtStats: () => ["dht-stats"] as const,
  systemFonts: () => ["system_fonts"] as const,
  coverManualSearch: (query: string) => ["cover_manual_search", query] as const,
  appUpdates: () => ["app-updates"] as const,
  releasesPoll: () => ["anilist-releases"] as const,
  wallpaper: (id: string | null) => ["dither-wallpaper", id] as const,
  wallpaperScope: () => ["dither-wallpaper"] as const,
  extraFiles: (dir: string | null | undefined) => ["extra_files", dir ?? ""] as const,
  extraFilesScope: () => ["extra_files"] as const,
  animeScreen: (id: number) => ["anime_screen", id] as const,
  animeCharacters: (id: number) => ["anime_characters", id] as const,
  characterDetail: (id: number) => ["character_detail", id] as const,
  staffDetail: (id: number, key: string) => ["staff_detail", id, key] as const,
  shaders: () => ["anime4k_shaders"] as const,
  upscaleConfig: () => ["upscale_config"] as const,
  upscaleSuggest: (filePath: string) => ["upscale_suggest", filePath] as const,
  upscaleEstimate: (filePath: string, opts: readonly string[]) =>
    ["upscale_estimate", filePath, ...opts] as const,
  summaryFfprobe: () => ["summary_ffprobe"] as const,
  summaryVersion: () => ["summary_version"] as const,
  summaryStorage: () => ["settings_summary_storage"] as const,
  playerFileSearch: (query: string, extensions: readonly string[]) =>
    ["player-file-search", query, extensions] as const,
  checkFfprobe: () => ["check-ffprobe"] as const,
  collectionData: () => ["collection-data"] as const,
  cardsBootstrap: () => ["cards-bootstrap"] as const,
  cardsPacks: (proxy: string) => ["cards-packs", proxy] as const,
  cardsPacksScope: () => ["cards-packs"] as const,
  cardsCollection: (request: unknown, proxy: string) =>
    ["cards-collection", request, proxy] as const,
  cardsCollectionInfinite: (request: unknown, proxy: string) =>
    ["cards-collection", "infinite", request, proxy] as const,
  cardsCollectionScope: () => ["cards-collection"] as const,
  cardsCardVariants: (kind: string, entityId: number) =>
    ["cards-card-variants", kind, entityId] as const,
  cardsCardFavorite: (kind: string, entityId: number) =>
    ["cards-card-favorite", kind, entityId] as const,
  cardsGallery: (kind: string, entityId: number, proxy: string) =>
    ["cards-gallery", kind, entityId, proxy] as const,
  cardsCollections: (sort: string, sortDir: string, proxy: string) =>
    ["cards-collections", sort, sortDir, proxy] as const,
  cardsCollectionsScope: () => ["cards-collections"] as const,
  cardsAnimeCollection: (animeId: number, kind: string, proxy: string) =>
    ["cards-anime-collection", animeId, kind, proxy] as const,
  cardsCollectionRoster: (mediaId: number, kind: string, page: number, proxy: string) =>
    ["cards-collection-roster", mediaId, kind, page, proxy] as const,
  cardsStats: () => ["cards-stats"] as const,
  cardsGifts: () => ["cards-gifts"] as const,
  cardsGiftsScope: () => ["cards-gifts"] as const,
  cardsUnread: (packsSince: number, cardsSince: number) =>
    ["cards-unread", packsSince, cardsSince] as const,
  cardsUnreadScope: () => ["cards-unread"] as const,
} as const;
