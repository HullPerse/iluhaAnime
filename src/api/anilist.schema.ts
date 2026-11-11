import * as z from "zod/mini";

const NullableStringSchema = z.nullable(z.string());
const NullableNumberSchema = z.nullable(z.number());

export const AniMediaSchema = z.looseObject({
  id: z.number(),
  title: z.string(),
  status: z.optional(z.string()),
  genres: z.optional(z.array(z.string())),
});

const AniListEntrySchema = z.looseObject({
  media: AniMediaSchema,
  list_status: z.string(),
  custom_lists: z.array(z.string()),
});

const AniListCollectionSchema = z.looseObject({
  name: z.string(),
  entries: z.array(AniListEntrySchema),
});

const AniUserShape = z.looseObject({
  id: z.number(),
  name: z.string(),
});

const AniUserProfileSchema = z.looseObject({
  id: z.number(),
  name: z.string(),
  banner_image: z.nullable(z.string()),
  about: z.nullable(z.string()),
});

const AniFriendMinimalSchema = z.looseObject({
  id: z.number(),
  name: z.string(),
});

const AniCharacterNodeSchema = z.looseObject({
  id: z.number(),
  name: z.string(),
  native_name: NullableStringSchema,
  image: NullableStringSchema,
  favourites: NullableNumberSchema,
  site_url: NullableStringSchema,
});

const AniVoiceActorSchema = z.looseObject({
  id: z.number(),
  name: z.string(),
  native_name: NullableStringSchema,
  image: NullableStringSchema,
  language: NullableStringSchema,
});

const AniCharacterEdgeSchema = z.looseObject({
  role: z.string(),
  character: AniCharacterNodeSchema,
  voice_actors: z.array(AniVoiceActorSchema),
});

const AniCharacterMediaEdgeSchema = z.looseObject({
  id: z.number(),
  title: z.string(),
  cover_url: NullableStringSchema,
});

const AniStaffCharacterEdgeSchema = z.looseObject({
  id: z.number(),
  name: z.string(),
  image: NullableStringSchema,
});

const AniStaffMediaEdgeSchema = z.looseObject({
  id: z.number(),
  title: z.string(),
  cover_url: NullableStringSchema,
});

const AniAnimeStaffEdgeSchema = z.looseObject({
  role: z.string(),
  id: z.number(),
  name: z.string(),
});

const AniRecommendationSchema = z.looseObject({
  id: z.number(),
  title: z.string(),
  cover_url: NullableStringSchema,
  episodes: NullableNumberSchema,
  score: NullableNumberSchema,
  format: NullableStringSchema,
  recommendation_rating: z.number(),
});

const FavouriteTitleSchema = z.looseObject({
  romaji: z.string(),
  english: NullableStringSchema,
});

const FavouriteImageSchema = z.looseObject({
  medium: NullableStringSchema,
});

const FavouriteAnimeSchema = z.looseObject({
  id: z.number(),
  title: FavouriteTitleSchema,
  cover_image: z.nullable(FavouriteImageSchema),
  mean_score: NullableNumberSchema,
  format: NullableStringSchema,
});

const FavouritePersonSchema = z.looseObject({
  id: z.number(),
  name: z.string(),
  image: NullableStringSchema,
});

const FavouritePeopleSchema = z.looseObject({
  staff: z.array(FavouritePersonSchema),
  characters: z.array(FavouritePersonSchema),
});

const FranchiseNodeSchema = z.looseObject({
  id: z.number(),
  title: z.string(),
  cover_url: NullableStringSchema,
  episodes: NullableNumberSchema,
  score: NullableNumberSchema,
  format: NullableStringSchema,
  media_type: NullableStringSchema,
  year: NullableNumberSchema,
  status: NullableStringSchema,
  next_airing_episode: z.nullable(
    z.looseObject({
      episode: z.number(),
      airing_at: z.number(),
    })
  ),
});

const FranchiseEdgeSchema = z.looseObject({
  source: z.number(),
  target: z.number(),
  relation_type: z.string(),
});

export const AniMediaListSchema = z.compile(z.array(AniMediaSchema));
export const AniListCollectionListSchema = z.compile(z.array(AniListCollectionSchema));
export const AniUserSchema = z.compile(AniUserShape);
export const AniUserOrNullSchema = z.compile(z.nullable(AniUserShape));
export const AniUserProfileSchemaCompiled = z.compile(AniUserProfileSchema);
export const AniMediaPageSchema = z.compile(
  z.looseObject({ media: z.array(AniMediaSchema), total: z.number() })
);
export const FollowingPageSchema = z.compile(
  z.looseObject({ users: z.array(AniFriendMinimalSchema), has_next_page: z.boolean() })
);
export const AniListStatisticsSchema = z.compile(z.looseObject({ count: z.number() }));

export const AniCharacterEdgeListSchema = z.compile(z.array(AniCharacterEdgeSchema));
export const AniCharacterDetailSchema = z.compile(
  z.looseObject({
    id: z.number(),
    name: z.string(),
    native_name: NullableStringSchema,
    image: NullableStringSchema,
    favourites: NullableNumberSchema,
    site_url: NullableStringSchema,
    media: z.array(AniCharacterMediaEdgeSchema),
  })
);
export const AniStaffDetailSchema = z.compile(
  z.looseObject({
    id: z.number(),
    name: z.string(),
    native_name: NullableStringSchema,
    image: NullableStringSchema,
    about: NullableStringSchema,
    favourites: NullableNumberSchema,
    site_url: NullableStringSchema,
    character_count: z.number(),
    media_count: z.number(),
    characters: z.array(AniStaffCharacterEdgeSchema),
    media: z.array(AniStaffMediaEdgeSchema),
  })
);
export const AniAnimeStaffEdgeListSchema = z.compile(z.array(AniAnimeStaffEdgeSchema));
export const AniAnimeFullSchema = z.compile(
  z.looseObject({
    media: AniMediaSchema,
    characters: z.array(AniCharacterEdgeSchema),
    staff: z.array(AniAnimeStaffEdgeSchema),
    recommendations: z.array(AniRecommendationSchema),
  })
);
export const AniStreamingEpisodeListSchema = z.compile(
  z.array(
    z.looseObject({
      title: z.string(),
      thumbnail: z.optional(z.nullable(z.string())),
      url: z.string(),
      site: z.string(),
    })
  )
);
export const AniRecommendationListSchema = z.compile(z.array(AniRecommendationSchema));
export const FavouriteAnimeListSchema = z.compile(z.array(FavouriteAnimeSchema));
export const FavouritePersonListSchema = z.compile(z.array(FavouritePersonSchema));
export const FavouriteOverviewSchema = z.compile(
  z.looseObject({
    anime: z.array(FavouriteAnimeSchema),
    people: FavouritePeopleSchema,
  })
);
export const FranchiseGraphSchema = z.compile(
  z.looseObject({
    root_id: z.number(),
    nodes: z.array(FranchiseNodeSchema),
    edges: z.array(FranchiseEdgeSchema),
  })
);
export const PrefetchSummarySchema = z.compile(
  z.looseObject({
    processed: z.number(),
    fetched: z.number(),
    skipped: z.number(),
    cancelled: z.boolean(),
  })
);
export const AniSavedEntrySchema = z.compile(
  z.looseObject({
    id: NullableNumberSchema,
    status: NullableStringSchema,
    progress: NullableNumberSchema,
    repeat: z.optional(NullableNumberSchema),
    customLists: z.array(z.string()),
  })
);
export const AniFriendScoreListSchema = z.compile(
  z.array(
    z.looseObject({
      userId: z.number(),
      score: NullableNumberSchema,
      scoreFormat: NullableStringSchema,
      status: NullableStringSchema,
      progress: NullableNumberSchema,
      repeat: NullableNumberSchema,
      notes: NullableStringSchema,
      episodes: NullableNumberSchema,
    })
  )
);
export const AniTrailerSchema = z.compile(z.nullable(z.string()));
export const AniCacheStatsSchema = z.compile(
  z.looseObject({ hits: z.number(), misses: z.number() })
);
export const AniBooleanSchema = z.compile(z.boolean());
export const AniStringListSchema = z.compile(z.array(z.string()));
export const ActivityLikeStateSchema = z.compile(
  z.looseObject({ like_count: z.number(), is_liked: z.boolean() })
);
export const AniActivityListSchema = z.compile(
  z.array(
    z.looseObject({
      id: z.number(),
      created_at: z.number(),
      activity_type: z.string(),
      status: NullableStringSchema,
      progress: NullableStringSchema,
      text: NullableStringSchema,
      media_id: NullableNumberSchema,
      media_title: NullableStringSchema,
      media_cover: NullableStringSchema,
      user_id: z.number(),
      user_name: z.string(),
      user_avatar: NullableStringSchema,
      like_count: z.number(),
      is_liked: z.boolean(),
    })
  )
);
export const AniSiteNotificationListSchema = z.compile(
  z.array(
    z.looseObject({
      id: z.number(),
      kind: z.string(),
      created_at: z.number(),
      context: NullableStringSchema,
      contexts: z.array(z.string()),
      user_id: NullableNumberSchema,
      user_name: NullableStringSchema,
      user_avatar: NullableStringSchema,
      anime_id: NullableNumberSchema,
      anime_title: NullableStringSchema,
      anime_cover: NullableStringSchema,
      episode: NullableNumberSchema,
      activity_id: NullableNumberSchema,
      text: NullableStringSchema,
    })
  )
);
