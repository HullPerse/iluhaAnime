import type { TranslationKey } from "@/lib/locale/i18n.utils";

export interface ChangelogVersion {
  version: string;
  added: TranslationKey[];
  changed: TranslationKey[];
  fixed: TranslationKey[];
}

export const CHANGELOG: ChangelogVersion[] = [
  {
    version: "3.2.0",
    added: [
      "changelog.3_2_0.added.upscale_cascade",
      "changelog.3_2_0.added.upscale_preview",
      "changelog.3_2_0.added.upscale_realcugan",
      "changelog.3_2_0.added.upscale_suggest",
      "changelog.3_2_0.added.upscale_codec",
      "changelog.3_2_0.added.upscale_rife",
      "changelog.3_2_0.added.upscale_temporal",
      "changelog.3_2_0.added.upscale_eta",
      "changelog.3_2_0.added.stills",
      "changelog.3_2_0.added.trailer",
      "changelog.3_2_0.added.media_db",
      "changelog.3_2_0.added.jobcenter",
      "changelog.3_2_0.added.queue",
      "changelog.3_2_0.added.scan_task",
      "changelog.3_2_0.added.folder_resize",
      "changelog.3_2_0.added.torrent_states",
      "changelog.3_2_0.added.chips",
      "changelog.3_2_0.added.bridge",
      "changelog.3_2_0.added.prefetch_resume",
      "changelog.3_2_0.added.summary",
      "changelog.3_2_0.added.changelog_tab",
      "changelog.3_2_0.added.import_modes",
      "changelog.3_2_0.added.friends_activity",
      "changelog.3_2_0.added.favorites",
      "changelog.3_2_0.added.proxies",
      "changelog.3_2_0.added.notifications_lists",
      "changelog.3_2_0.added.sqlite_views",
      "changelog.3_2_0.added.search_tags",
      "changelog.3_2_0.added.backfill",
      "changelog.3_2_0.added.github",
    ],
    changed: [
      "changelog.3_2_0.changed.settings_layout",
      "changelog.3_2_0.changed.toasts",
      "changelog.3_2_0.changed.shikimori",
      "changelog.3_2_0.changed.vault",
      "changelog.3_2_0.changed.duplicates",
      "changelog.3_2_0.changed.activity_button",
      "changelog.3_2_0.changed.anilist_tabs",
    ],
    fixed: [
      "changelog.3_2_0.fixed.fts",
      "changelog.3_2_0.fixed.activity_modal",
      "changelog.3_2_0.fixed.eye",
      "changelog.3_2_0.fixed.lost_update",
      "changelog.3_2_0.fixed.updated_at",
      "changelog.3_2_0.fixed.cloudflare",
      "changelog.3_2_0.fixed.search_hang",
    ],
  },
];
