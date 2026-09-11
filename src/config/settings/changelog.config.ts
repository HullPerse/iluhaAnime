import type { TranslationKey } from "@/lib/locale/i18n.utils";
import type { ChangelogEntry, ChangelogScope } from "@/types/settings";

export interface ChangelogVersion {
  version: string;
  added: ChangelogEntry[];
  changed: ChangelogEntry[];
  fixed: ChangelogEntry[];
}

function entry(key: TranslationKey, scope: ChangelogScope): ChangelogEntry {
  return { key, scope };
}

export const CHANGELOG: ChangelogVersion[] = [
  {
    version: "4.0.4",
    added: [entry("changelog.4_0_4.added.friend_scores", "anilist")],
    changed: [entry("changelog.4_0_4.changed.friends_modal", "anilist"), entry("changelog.4_0_4.changed.friend_scores_swatch", "anilist"), entry("changelog.4_0_4.changed.parallax_removed", "search")],
    fixed: [entry("changelog.4_0_4.fixed.youtube_build", "anilist"), entry("changelog.4_0_4.fixed.character_duplicate_key", "anilist")],
  },
  {
    version: "4.0.3",
    added: [
      entry("changelog.4_0_3.added.torrent_links", "torrents"),
      entry("changelog.4_0_3.added.link_paste", "app"),
      entry("changelog.4_0_3.added.friend_lists", "anilist"),
      entry("changelog.4_0_3.added.continue_row", "collection"),
      entry("changelog.4_0_3.added.credits_seasons", "collection"),
      entry("changelog.4_0_3.added.diagnostics", "torrents"),
      entry("changelog.4_0_3.added.bulk_actions", "torrents"),
      entry("changelog.4_0_3.added.torrent_network", "settings"),
      entry("changelog.4_0_3.added.media_panel", "settings"),
      entry("changelog.4_0_3.added.did_you_mean", "search"),
      entry("changelog.4_0_3.added.queue_retry", "player"),
    ],
    changed: [
      entry("changelog.4_0_3.changed.torrent_notify", "torrents"),
      entry("changelog.4_0_3.changed.root_sizes", "player"),
      entry("changelog.4_0_3.changed.sqlite_jump", "settings"),
    ],
    fixed: [
      entry("changelog.4_0_3.fixed.anime_link_tab", "anilist"),
      entry("changelog.4_0_3.fixed.fav_errors", "anilist"),
    ],
  },
  {
    version: "4.0.2",
    added: [],
    changed: [entry("changelog.4_0_2.changed.cover_thumbs", "collection")],
    fixed: [],
  },
  {
    version: "4.0.1",
    added: [],
    changed: [
      entry("changelog.4_0_1.changed.radio_nav", "search"),
      entry("changelog.4_0_1.changed.tag_docs", "collection"),
    ],
    fixed: [entry("changelog.4_0_1.fixed.color_popup", "app")],
  },
  {
    version: "4.0.0",
    added: [
      entry("changelog.4_0_0.added.modern_tab", "search"),
      entry("changelog.4_0_0.added.dither_presets", "search"),
      entry("changelog.4_0_0.added.wallpaper_fx", "search"),
      entry("changelog.4_0_0.added.spotlight", "anilist"),
      entry("changelog.4_0_0.added.random_menu", "collection"),
      entry("changelog.4_0_0.added.random_filters", "anilist"),
      entry("changelog.4_0_0.added.deeplinks", "app"),
      entry("changelog.4_0_0.added.release_dates", "collection"),
      entry("changelog.4_0_0.added.tag_ranges", "collection"),
      entry("changelog.4_0_0.added.franchise", "anilist"),
      entry("changelog.4_0_0.added.fav_people", "anilist"),
      entry("changelog.4_0_0.added.bilingual_labels", "collection"),
      entry("changelog.4_0_0.added.descriptions", "collection"),
      entry("changelog.4_0_0.added.filmstrip", "collection"),
      entry("changelog.4_0_0.added.fonts", "settings"),
      entry("changelog.4_0_0.added.sqlite_editor", "settings"),
      entry("changelog.4_0_0.added.autocomplete", "search"),
      entry("changelog.4_0_0.added.host_stats", "app"),
    ],
    changed: [
      entry("changelog.4_0_0.changed.tag_syntax", "collection"),
      entry("changelog.4_0_0.changed.anilist_tags", "collection"),
      entry("changelog.4_0_0.changed.jobcenter", "app"),
      entry("changelog.4_0_0.changed.semantic", "search"),
      entry("changelog.4_0_0.changed.gif", "search"),
      entry("changelog.4_0_0.changed.videoplayer", "app"),
      entry("changelog.4_0_0.changed.status_ui", "collection"),
      entry("changelog.4_0_0.changed.squares", "anilist"),
      entry("changelog.4_0_0.changed.tmdb_key", "settings"),
      entry("changelog.4_0_0.changed.list_rows", "collection"),
      entry("changelog.4_0_0.changed.autopause", "torrents"),
      entry("changelog.4_0_0.changed.hints", "app"),
      entry("changelog.4_0_0.changed.plurals_time", "app"),
    ],
    fixed: [
      entry("changelog.4_0_0.fixed.crash", "player"),
      entry("changelog.4_0_0.fixed.fresh_images", "app"),
      entry("changelog.4_0_0.fixed.status_order", "collection"),
      entry("changelog.4_0_0.fixed.files", "torrents"),
      entry("changelog.4_0_0.fixed.quickadd", "collection"),
      entry("changelog.4_0_0.fixed.refresh_touch", "collection"),
      entry("changelog.4_0_0.fixed.tmdb_covers", "anilist"),
    ],
  },
  {
    version: "3.2.0",
    added: [
      entry("changelog.3_2_0.added.upscale_cascade", "upscale"),
      entry("changelog.3_2_0.added.upscale_preview", "upscale"),
      entry("changelog.3_2_0.added.upscale_realcugan", "upscale"),
      entry("changelog.3_2_0.added.upscale_suggest", "upscale"),
      entry("changelog.3_2_0.added.upscale_codec", "upscale"),
      entry("changelog.3_2_0.added.upscale_rife", "upscale"),
      entry("changelog.3_2_0.added.upscale_temporal", "upscale"),
      entry("changelog.3_2_0.added.upscale_eta", "upscale"),
      entry("changelog.3_2_0.added.stills", "collection"),
      entry("changelog.3_2_0.added.trailer", "collection"),
      entry("changelog.3_2_0.added.media_db", "collection"),
      entry("changelog.3_2_0.added.jobcenter", "app"),
      entry("changelog.3_2_0.added.queue", "player"),
      entry("changelog.3_2_0.added.scan_task", "player"),
      entry("changelog.3_2_0.added.folder_resize", "player"),
      entry("changelog.3_2_0.added.torrent_states", "torrents"),
      entry("changelog.3_2_0.added.chips", "torrents"),
      entry("changelog.3_2_0.added.bridge", "anilist"),
      entry("changelog.3_2_0.added.prefetch_resume", "anilist"),
      entry("changelog.3_2_0.added.summary", "settings"),
      entry("changelog.3_2_0.added.changelog_tab", "settings"),
      entry("changelog.3_2_0.added.import_modes", "anilist"),
      entry("changelog.3_2_0.added.friends_activity", "anilist"),
      entry("changelog.3_2_0.added.favorites", "collection"),
      entry("changelog.3_2_0.added.proxies", "torrents"),
      entry("changelog.3_2_0.added.notifications_lists", "anilist"),
      entry("changelog.3_2_0.added.sqlite_views", "settings"),
      entry("changelog.3_2_0.added.search_tags", "collection"),
      entry("changelog.3_2_0.added.backfill", "settings"),
      entry("changelog.3_2_0.added.github", "app"),
    ],
    changed: [
      entry("changelog.3_2_0.changed.settings_layout", "settings"),
      entry("changelog.3_2_0.changed.toasts", "app"),
      entry("changelog.3_2_0.changed.shikimori", "app"),
      entry("changelog.3_2_0.changed.vault", "app"),
      entry("changelog.3_2_0.changed.duplicates", "collection"),
      entry("changelog.3_2_0.changed.activity_button", "anilist"),
      entry("changelog.3_2_0.changed.anilist_tabs", "anilist"),
    ],
    fixed: [
      entry("changelog.3_2_0.fixed.fts", "collection"),
      entry("changelog.3_2_0.fixed.activity_modal", "anilist"),
      entry("changelog.3_2_0.fixed.eye", "torrents"),
      entry("changelog.3_2_0.fixed.lost_update", "collection"),
      entry("changelog.3_2_0.fixed.updated_at", "collection"),
      entry("changelog.3_2_0.fixed.cloudflare", "torrents"),
      entry("changelog.3_2_0.fixed.search_hang", "torrents"),
    ],
  },
];
