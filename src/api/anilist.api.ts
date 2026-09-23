import { searchFiltersToParams } from "@/lib/anilist/entries.utils";
import { anilistProxyArgs } from "@/lib/anilist/proxy.utils";
import { useSettingsStore } from "@/store/settings.store";
import type {
  AniActivity,
  AniAnimeStaffEdge,
  AniCharacterDetail,
  AniCharacterEdge,
  AniListCollection,
  AniMedia,
  AniRecommendation,
  AniStaffDetail,
  AniUser,
  AniUserProfile,
  FavouriteAnime,
  FavouritePeople,
  FavouritePerson,
  FranchiseGraph,
  PrefetchSummary,
} from "@/types/anilist";
import type { FilterPage, SpotlightPage } from "@/types/ipc";

import { tauriTransport } from "./transport.api";
import type { ApiTransport } from "./transport.api";

export interface AnilistApiConfig {
  transport?: ApiTransport;
  proxyUrl?: string | null;
}

export interface SaveAnilistEntryInput {
  mediaId: number;
  status: string;
  progress: number | null;
  score: number | null;
  notes: string | null;
}

export type AnilistSearchParams = Partial<ReturnType<typeof searchFiltersToParams>>;

export type AnilistFilterPageParams = AnilistSearchParams & { page: number };

export class AnilistApi {
  private readonly transport: ApiTransport;
  private readonly proxyUrl: string | null;

  constructor(config: AnilistApiConfig = {}) {
    this.transport = config.transport ?? tauriTransport;
    this.proxyUrl = config.proxyUrl ?? null;
  }

  private proxy(): Record<string, string> {
    const fromStore = useSettingsStore.getState().anilistProxyUrl;
    return anilistProxyArgs(this.proxyUrl ?? fromStore);
  }

  private call<T>(command: string, args: Record<string, unknown> = {}): Promise<T> {
    return this.transport.call<T>(command, { ...args, ...this.proxy() });
  }

  login(token: string): Promise<AniUser> {
    return this.call("anilist_login", { token: token.trim() });
  }

  logout(): Promise<void> {
    return this.call("anilist_logout");
  }

  checkAuth(): Promise<AniUser | null> {
    return this.call("check_anilist_auth");
  }

  getProfile(userId?: number, userName?: string): Promise<AniUserProfile> {
    return this.call("get_anilist_profile", { userId, userName });
  }

  getLists(userId: number): Promise<AniListCollection[]> {
    return this.call("get_anilist_lists", { userId });
  }

  search<T = AniMedia>(params: AnilistSearchParams): Promise<T[]> {
    return this.call("search_anilist", { ...params });
  }

  searchByStudio(studioId: number): Promise<AniMedia[]> {
    return this.call("search_anilist_by_studio", { studioId });
  }

  searchByTag(tag: string): Promise<AniMedia[]> {
    return this.call("search_anilist_by_tag", { tag });
  }

  searchByGenre(genre: string): Promise<AniMedia[]> {
    return this.call("search_anilist_by_genre", { genre });
  }

  filterPage(params: AnilistFilterPageParams): Promise<FilterPage> {
    return this.call("get_anilist_filter_page", { ...params });
  }

  getAnimeById<T = AniMedia>(id: number): Promise<T> {
    return this.call("get_anime_by_id", { id });
  }

  getAnimeCharacters(id: number, page: number): Promise<AniCharacterEdge[]> {
    return this.call("get_anime_characters", { id, page });
  }

  getCharacterDetail(id: number, page: number): Promise<AniCharacterDetail> {
    return this.call("get_character_detail", { id, page });
  }

  getStaffCharacters(id: number, page: number, charPage?: number): Promise<AniStaffDetail> {
    return this.call("get_staff_characters", { id, page, charPage });
  }

  getAnimeStaff(id: number): Promise<AniAnimeStaffEdge[]> {
    return this.call("get_anime_staff", { id });
  }

  getFavourites(userId: number): Promise<FavouriteAnime[]> {
    return this.call("get_favourites", { userId });
  }

  getFavouritePeople(userId: number): Promise<FavouritePeople> {
    return this.call("get_favourite_people", { userId });
  }

  toggleFavourite(animeId: number): Promise<FavouriteAnime[]> {
    return this.call("toggle_favourite", { animeId });
  }

  toggleFavouriteStaff(staffId: number): Promise<FavouritePerson[]> {
    return this.call("toggle_favourite_staff", { staffId });
  }

  toggleFavouriteCharacter(characterId: number): Promise<FavouritePerson[]> {
    return this.call("toggle_favourite_character", { characterId });
  }

  saveEntry(input: SaveAnilistEntryInput): Promise<void> {
    return this.call("save_anilist_entry", { ...input });
  }

  testConnection(): Promise<string> {
    return this.call("test_anilist_connection");
  }

  getActivity(userIds: number[]): Promise<AniActivity[]> {
    return this.call("get_anilist_activity", { userIds });
  }

  getProfileRecommendations(userId: number): Promise<AniRecommendation[]> {
    return this.call("get_profile_recommendations", { userId });
  }

  getAnimeRecommendations(id: number): Promise<AniRecommendation[]> {
    return this.call("get_anime_recommendations", { id });
  }

  getAnimeFranchise(id: number, scope: string): Promise<FranchiseGraph> {
    return this.call("get_anime_franchise", { id, scope });
  }

  prefetchRelations(animeIds: number[]): Promise<PrefetchSummary> {
    return this.call("prefetch_anime_relations", { animeIds });
  }

  cancelPrefetch(): Promise<void> {
    return this.call("cancel_anime_prefetch");
  }

  syncFranchiseToIndex(): Promise<number> {
    return this.call("sync_franchise_to_index");
  }

  getSpotlightPage(page: number, perPage: number, scoreFrom: number): Promise<SpotlightPage> {
    return this.call("get_spotlight_page", { page, perPage, scoreFrom });
  }
}

export const anilistApi = new AnilistApi();
