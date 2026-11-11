import { searchFiltersToParams } from "@/lib/anilist/entries.utils";
import { anilistProxyArgs } from "@/lib/anilist/anilistProxy.utils";
import { noteNetworkFailure, noteNetworkSuccess } from "@/lib/core/system/networkHealth.utils";
import { settingsAtoms } from "@/store/settings.store";
import { attempt } from "@hullperse/hp_utils/attempt";
import { assertSchema } from "@/lib/core/system/invoke.utils";
import {
  ActivityLikeStateSchema,
  AniAnimeFullSchema,
  AniAnimeStaffEdgeListSchema,
  AniBooleanSchema,
  AniCacheStatsSchema,
  AniCharacterDetailSchema,
  AniCharacterEdgeListSchema,
  AniFriendScoreListSchema,
  AniListCollectionListSchema,
  AniListStatisticsSchema,
  AniMediaListSchema,
  AniMediaPageSchema,
  AniMediaSchema,
  AniRecommendationListSchema,
  AniActivityListSchema,
  AniSavedEntrySchema,
  AniSiteNotificationListSchema,
  AniStaffDetailSchema,
  AniStreamingEpisodeListSchema,
  AniStringListSchema,
  AniTrailerSchema,
  AniUserOrNullSchema,
  AniUserProfileSchemaCompiled,
  AniUserSchema,
  FavouriteAnimeListSchema,
  FavouriteOverviewSchema,
  FavouritePersonListSchema,
  FollowingPageSchema,
  FranchiseGraphSchema,
  PrefetchSummarySchema,
} from "@/api/anilist.schema";
import type {
  ActivityLikeState,
  AniActivity,
  AniSiteNotification,
  AniAnimeFull,
  AniAnimeStaffEdge,
  AniCharacterDetail,
  AniCharacterEdge,
  AniListCollection,
  AniListStatistics,
  AniMedia,
  AniRecommendation,
  AniSavedEntry,
  AniStaffDetail,
  AniStreamingEpisode,
  AniUser,
  AniUserProfile,
  FavouriteAnime,
  FavouriteOverview,
  FavouritePerson,
  FollowingPage,
  FranchiseGraph,
  PrefetchSummary,
} from "@/types/anilist/anilist";
import type {
  AniFriendScore,
} from "@/types/anilist/anilistUi";
import type { FilterPage, SpotlightPage } from "@/types/core/ipc";

import { tauriTransport } from "@/api/transport.api";
import type { ApiTransport } from "@/types/core/transport";
import type { AnilistApiConfig, SaveAnilistEntryInput } from "@/types/api/anilist";

export type AnilistSearchParams = Partial<ReturnType<typeof searchFiltersToParams>>;

export type AnilistFilterPageParams = AnilistSearchParams & { page: number };

const OMIT_WHEN_NULL: ReadonlySet<string> = new Set(["progress", "score", "repeat"]);

export class AnilistApi {
  private readonly transport: ApiTransport;
  private readonly proxyUrl: string | null | (() => string | null);

  constructor(config: AnilistApiConfig = {}) {
    this.transport = config.transport ?? tauriTransport;
    this.proxyUrl = config.proxyUrl ?? null;
  }

  private proxy(): Record<string, string> {
    const resolved = typeof this.proxyUrl === "function" ? this.proxyUrl() : this.proxyUrl;
    return anilistProxyArgs(resolved);
  }

  private async call<T>(command: string, args: Record<string, unknown> = {}): Promise<T> {
    const [value, error] = await attempt(
      this.transport.call<T>(command, { ...args, ...this.proxy() })
    );
    if (error !== null) {
      noteNetworkFailure(error);
      throw error;
    }
    noteNetworkSuccess();
    return value;
  }

  async login(token: string): Promise<AniUser> {
    const user = await this.call<AniUser>("anilist_login", { token: token.trim() });
    assertSchema(user, AniUserSchema);
    return user;
  }

  logout(): Promise<void> {
    return this.call("anilist_logout");
  }

  async checkAuth(): Promise<AniUser | null> {
    const user = await this.call<AniUser | null>("check_anilist_auth");
    assertSchema(user, AniUserOrNullSchema);
    return user;
  }

  async getProfile(userId?: number, userName?: string): Promise<AniUserProfile> {
    const profile = await this.call<AniUserProfile>("get_anilist_profile", {
      userId,
      userName,
    });
    assertSchema(profile, AniUserProfileSchemaCompiled);
    return profile;
  }

  async getLists(userId: number, minimal = false): Promise<AniListCollection[]> {
    const lists = await this.call<AniListCollection[]>("get_anilist_lists", {
      userId,
      minimal,
    });
    assertSchema(lists, AniListCollectionListSchema);
    return lists;
  }

  async getStatistics(userId: number): Promise<AniListStatistics> {
    const statistics = await this.call<AniListStatistics>("get_anilist_statistics", { userId });
    assertSchema(statistics, AniListStatisticsSchema);
    return statistics;
  }

  async getFriendScores(mediaId: number, userIds: number[]): Promise<AniFriendScore[]> {
    const scores = await this.call<AniFriendScore[]>("get_anilist_friend_scores", {
      mediaId,
      userIds,
    });
    assertSchema(scores, AniFriendScoreListSchema);
    return scores;
  }

  async getFollowing(userId: number, page = 1, perPage = 25): Promise<FollowingPage> {
    const following = await this.call<FollowingPage>("get_anilist_following", {
      userId,
      page,
      perPage,
    });
    assertSchema(following, FollowingPageSchema);
    return following;
  }

  async search<T = AniMedia>(params: AnilistSearchParams): Promise<T[]> {
    const media = await this.call<T[]>("search_anilist", { ...params });
    assertSchema(media, AniMediaListSchema);
    return media;
  }

  async searchByStudio(studioId: number): Promise<AniMedia[]> {
    const media = await this.call<AniMedia[]>("search_anilist_by_studio", { studioId });
    assertSchema(media, AniMediaListSchema);
    return media;
  }

  async searchByTag(tag: string): Promise<AniMedia[]> {
    const media = await this.call<AniMedia[]>("search_anilist_by_tag", { tag });
    assertSchema(media, AniMediaListSchema);
    return media;
  }

  async searchByGenre(genre: string): Promise<AniMedia[]> {
    const media = await this.call<AniMedia[]>("search_anilist_by_genre", { genre });
    assertSchema(media, AniMediaListSchema);
    return media;
  }

  async filterPage(params: AnilistFilterPageParams): Promise<FilterPage> {
    const page = await this.call<FilterPage>("get_anilist_filter_page", { ...params });
    assertSchema(page, AniMediaPageSchema);
    return page;
  }

  async getAnimeById<T = AniMedia>(id: number): Promise<T> {
    const media = await this.call<T>("get_anime_by_id", { id });
    assertSchema(media, AniMediaSchema);
    return media;
  }

  async getCacheStats(): Promise<{ hits: number; misses: number }> {
    const stats = await this.call<{ hits: number; misses: number }>("get_anilist_cache_stats");
    assertSchema(stats, AniCacheStatsSchema);
    return stats;
  }

  async getAnimeTrailer(id: number): Promise<string | null> {
    const trailer = await this.call<string | null>("get_anime_trailer", { id });
    assertSchema(trailer, AniTrailerSchema);
    return trailer;
  }

  async getAnimeFull(id: number): Promise<AniAnimeFull> {
    const full = await this.call<AniAnimeFull>("get_anime_full", { id });
    assertSchema(full, AniAnimeFullSchema);
    return full;
  }

  async getStreamingEpisodes(id: number): Promise<AniStreamingEpisode[]> {
    const episodes = await this.call<AniStreamingEpisode[]>("get_anime_streaming_episodes", {
      id,
    });
    assertSchema(episodes, AniStreamingEpisodeListSchema);
    return episodes;
  }

  async getAnimeByIds(ids: number[]): Promise<AniMedia[]> {
    const media = await this.call<AniMedia[]>("get_anime_by_ids", { ids });
    assertSchema(media, AniMediaListSchema);
    return media;
  }

  async getAnimeCharacters(id: number, page: number): Promise<AniCharacterEdge[]> {
    const characters = await this.call<AniCharacterEdge[]>("get_anime_characters", { id, page });
    assertSchema(characters, AniCharacterEdgeListSchema);
    return characters;
  }

  async getCharacterDetail(id: number, page: number): Promise<AniCharacterDetail> {
    const detail = await this.call<AniCharacterDetail>("get_character_detail", { id, page });
    assertSchema(detail, AniCharacterDetailSchema);
    return detail;
  }

  async getStaffCharacters(
    id: number,
    page: number,
    charPage?: number
  ): Promise<AniStaffDetail> {
    const detail = await this.call<AniStaffDetail>("get_staff_characters", {
      id,
      page,
      charPage,
    });
    assertSchema(detail, AniStaffDetailSchema);
    return detail;
  }

  async getAnimeStaff(id: number): Promise<AniAnimeStaffEdge[]> {
    const staff = await this.call<AniAnimeStaffEdge[]>("get_anime_staff", { id });
    assertSchema(staff, AniAnimeStaffEdgeListSchema);
    return staff;
  }

  async getFavourites(userId: number): Promise<FavouriteAnime[]> {
    const favourites = await this.call<FavouriteAnime[]>("get_favourites", { userId });
    assertSchema(favourites, FavouriteAnimeListSchema);
    return favourites;
  }

  async getFavouriteOverview(userId: number): Promise<FavouriteOverview> {
    const overview = await this.call<FavouriteOverview>("get_favourite_overview", { userId });
    assertSchema(overview, FavouriteOverviewSchema);
    return overview;
  }

  async toggleFavourite(animeId: number): Promise<FavouriteAnime[]> {
    const favourites = await this.call<FavouriteAnime[]>("toggle_favourite", { animeId });
    assertSchema(favourites, FavouriteAnimeListSchema);
    return favourites;
  }

  async toggleFavouriteStaff(staffId: number): Promise<FavouritePerson[]> {
    const favourites = await this.call<FavouritePerson[]>("toggle_favourite_staff", { staffId });
    assertSchema(favourites, FavouritePersonListSchema);
    return favourites;
  }

  async toggleFavouriteCharacter(characterId: number): Promise<FavouritePerson[]> {
    const favourites = await this.call<FavouritePerson[]>("toggle_favourite_character", {
      characterId,
    });
    assertSchema(favourites, FavouritePersonListSchema);
    return favourites;
  }

  async getCustomLists(): Promise<string[]> {
    const lists = await this.call<string[]>("get_anilist_custom_lists");
    assertSchema(lists, AniStringListSchema);
    return lists;
  }

  async getSiteNotifications(): Promise<AniSiteNotification[]> {
    const notifications = await this.call<AniSiteNotification[]>("get_anilist_notifications");
    assertSchema(notifications, AniSiteNotificationListSchema);
    return notifications;
  }

  async saveEntry(input: SaveAnilistEntryInput): Promise<AniSavedEntry> {
    const { mediaId, ...rest } = input;
    const args: Record<string, unknown> = { media_id: mediaId };
    for (const [key, value] of Object.entries(rest)) {
      if (value === undefined) continue;
      if (value === null && OMIT_WHEN_NULL.has(key)) continue;
      args[key] = value;
    }
    const entry = await this.call<AniSavedEntry>("save_anilist_entry", args);
    assertSchema(entry, AniSavedEntrySchema);
    return entry;
  }

  async deleteEntry(mediaId: number, userId: number): Promise<boolean> {
    const deleted = await this.call<boolean>("delete_anilist_entry", {
      media_id: mediaId,
      user_id: userId,
    });
    assertSchema(deleted, AniBooleanSchema);
    return deleted;
  }

  testConnection(): Promise<string> {
    return this.call("test_anilist_connection");
  }

  async getActivity(userIds: number[]): Promise<AniActivity[]> {
    const activities = await this.call<AniActivity[]>("get_anilist_activity", { userIds });
    assertSchema(activities, AniActivityListSchema);
    return activities;
  }

  async toggleActivityLike(activityId: number): Promise<ActivityLikeState> {
    const state = await this.call<ActivityLikeState>("toggle_activity_like", { activityId });
    assertSchema(state, ActivityLikeStateSchema);
    return state;
  }

  async getProfileRecommendations(userId: number): Promise<AniRecommendation[]> {
    const recommendations = await this.call<AniRecommendation[]>("get_profile_recommendations", {
      userId,
    });
    assertSchema(recommendations, AniRecommendationListSchema);
    return recommendations;
  }

  async getAnimeRecommendations(id: number): Promise<AniRecommendation[]> {
    const recommendations = await this.call<AniRecommendation[]>("get_anime_recommendations", {
      id,
    });
    assertSchema(recommendations, AniRecommendationListSchema);
    return recommendations;
  }

  async getAnimeFranchise(id: number, scope: string): Promise<FranchiseGraph> {
    const graph = await this.call<FranchiseGraph>("get_anime_franchise", { id, scope });
    assertSchema(graph, FranchiseGraphSchema);
    return graph;
  }

  async prefetchRelations(animeIds: number[]): Promise<PrefetchSummary> {
    const summary = await this.call<PrefetchSummary>("prefetch_anime_relations", { animeIds });
    assertSchema(summary, PrefetchSummarySchema);
    return summary;
  }

  cancelPrefetch(): Promise<void> {
    return this.call("cancel_anime_prefetch");
  }

  syncFranchiseToIndex(): Promise<number> {
    return this.call("sync_franchise_to_index");
  }

  async getSpotlightPage(
    page: number,
    perPage: number,
    scoreFrom: number
  ): Promise<SpotlightPage> {
    const result = await this.call<SpotlightPage>("get_spotlight_page", {
      page,
      perPage,
      scoreFrom,
    });
    assertSchema(result, AniMediaPageSchema);
    return result;
  }
}

export const anilistApi = new AnilistApi({
  proxyUrl: () => settingsAtoms.anilistProxyUrl.get(),
});
