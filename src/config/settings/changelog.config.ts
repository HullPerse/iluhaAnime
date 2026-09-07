import type { TranslationKey } from "@/lib/locale/i18n.utils";

export type ChangelogScope =
  | "upscale"
  | "player"
  | "torrents"
  | "collection"
  | "anilist"
  | "settings"
  | "app";

export interface ChangelogEntry {
  key: TranslationKey;
  scope: ChangelogScope;
}

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
