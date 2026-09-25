export const queryKeys = {
  torrents: () => ["torrents"] as const,
  torrentFiles: (id: number) => ["torrent-files", id] as const,
  torrentDiagnostics: (id: number) => ["torrent_diagnostics", id] as const,
  torrentListenPort: () => ["torrent-listen-port"] as const,
  animeDetail: (id: number, proxy: string, loggedIn: boolean) =>
    ["anime_detail", id, proxy, loggedIn ? 1 : 0] as const,
  animeFranchise: (id: number) => ["franchise", id] as const,
  animeRecommendations: (id: number) => ["anime_recommendations", id] as const,
  animeShowcase: (id: number, tmdb: number, proxy: string) =>
    ["anilist_showcase", id, tmdb, proxy, "v3"] as const,
  anilistData: () => ["anilist_data"] as const,
  anilistBrowse: (tab: string) => ["anilist_browse", tab] as const,
  anilistFollowing: (userId: number | null) => ["anilist_following", userId] as const,
  friendLists: (id: number | null) => ["anilist_friend_lists", id] as const,
  friendFavourites: (id: number | null) => ["anilist_friend_favourites", id] as const,
  friendProfile: (id: number | null) => ["anilist_friend_profile", id] as const,
  friendScores: (id: number, friendsKey: string) =>
    ["anime_friend_scores", id, friendsKey] as const,
  activity: (ids: readonly number[]) => ["anilist_activity", ...ids] as const,
  collectionData: () => ["collection-data"] as const,
  tmdbMedia: (id: number | null, mediaType: string, keySet: boolean, proxy: string) =>
    ["tmdb_media", id, mediaType, keySet ? 1 : 0, proxy, "v2"] as const,
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
  searchSessions: (rutracker: string, nekobt: string, erai: string) =>
    ["search_sessions", rutracker, nekobt, erai] as const,
  hostStats: () => ["host-stats"] as const,
  tmdbRate: () => ["tmdb-rate"] as const,
  appUpdates: () => ["connection"] as const,
  releasesPoll: () => ["anilist-releases"] as const,
  wallpaper: (id: string | null) => ["dither-wallpaper", id] as const,
  extraFiles: (dir: string | null | undefined) => ["extra_files", dir ?? ""] as const,
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
} as const;
