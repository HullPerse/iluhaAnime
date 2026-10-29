import { findSubsequenceRanges, normalizeText } from "@/lib/highlight/highlight.utils";
import enSettings from "@/lib/locale/en/settings.locale";
import ruSettings from "@/lib/locale/ru/settings.locale";
import type { Locale } from "@/types/i18n";
import type { TranslationKey } from "@/types/i18n";
import type { HighlightRange } from "@/types/search";

export type SettingsFindTab =
  | "general"
  | "notifications"
  | "search"
  | "torrent"
  | "theme"
  | "keybinds";

export const SETTINGS_FIND_TAB_ORDER: readonly SettingsFindTab[] = [
  "general",
  "notifications",
  "search",
  "torrent",
  "theme",
  "keybinds",
];

export const SETTINGS_FIND_TAB_TITLES: Record<SettingsFindTab, TranslationKey> = {
  general: "settings.general",
  notifications: "settings.notifications",
  search: "settings.search",
  torrent: "settings.torrent",
  theme: "settings.theme",
  keybinds: "settings.keybinds",
};

export type SettingsFindKind = "tab" | "section" | "setting";

export interface SettingsFindEntry {
  key: TranslationKey;
  tab: SettingsFindTab;
  sectionId: string;
  kind: SettingsFindKind;
}

export interface SettingsFindHit {
  entry: SettingsFindEntry;
  score: number;
  matchedRu: boolean;
  matchedEn: boolean;
  rangesRu: HighlightRange[];
  rangesEn: HighlightRange[];
}

interface FindGroup {
  tab: SettingsFindTab;
  section: string;
  titleKey: TranslationKey;
  keys: readonly TranslationKey[];
}

const FIND_GROUPS: readonly FindGroup[] = [
  {
    tab: "general",
    section: "tabs",
    titleKey: "settings.tabs",
    keys: [
      "settings.collection.tab",
      "settings.anilist.tab",
      "settings.stream.tab",
      "settings.stream.tab.russianOnly",
      "settings.stream.tab.russianOnly.hint",
      "settings.sqlite",
      "settings.sqlite.browser.description",
    ],
  },
  {
    tab: "general",
    section: "startup",
    titleKey: "settings.startup",
    keys: ["settings.startup.fastLaunch", "settings.startup.fastLaunch.hint", "settings.startup.rememberLastTab"],
  },
  {
    tab: "general",
    section: "keyboard",
    titleKey: "settings.keyboard",
    keys: ["settings.vim.mode", "settings.vim.mode.hint"],
  },
  {
    tab: "general",
    section: "window",
    titleKey: "settings.window",
    keys: ["settings.tray.minimize", "settings.tray.minimize.description"],
  },
  {
    tab: "general",
    section: "language",
    titleKey: "settings.language",
    keys: [
      "settings.language",
      "settings.language.ru",
      "settings.language.en",
      "settings.ffmpeg.source",
      "settings.ffmpeg.source.essentials",
      "settings.ffmpeg.source.github",
      "settings.ffmpeg.source.mirror",
    ],
  },
  {
    tab: "general",
    section: "tmdb",
    titleKey: "settings.tmdb.api.key",
    keys: [
      "settings.tmdb.api.key",
      "settings.tmdb.api.key.description",
      "settings.tmdb.api.key.placeholder",
      "settings.tmdb.api.key.save",
      "settings.tmdb.api.key.remove",
      "settings.tmdb.api.key.stored",
      "settings.tmdb.api.key.empty",
      "settings.tmdb.proxy.url",
      "settings.tmdb.proxy.url.description",
      "settings.tmdb.proxy.no",
      "settings.tmdb.proxy.custom",
      "settings.tmdb.proxy.test",
    ],
  },
  {
    tab: "general",
    section: "animelib",
    titleKey: "settings.animelib.title",
    keys: [
      "settings.animelib.description",
      "settings.animelib.token",
      "settings.animelib.token.description",
      "settings.animelib.token.placeholder",
      "settings.animelib.token.save",
      "settings.animelib.token.clear",
      "settings.animelib.token.stored",
      "settings.animelib.token.empty",
      "settings.animelib.token.saved",
      "settings.animelib.proxy.url",
      "settings.animelib.proxy.url.description",
      "settings.animelib.proxy.no",
      "settings.animelib.proxy.custom",
    ],
  },
  {
    tab: "general",
    section: "anilist",
    titleKey: "settings.anilist.proxy.title",
    keys: [
      "settings.anilist.proxy.url",
      "settings.anilist.proxy.url.description",
      "settings.anilist.proxy.no",
      "settings.anilist.proxy.custom",
      "settings.anilist.proxy.test",
      "settings.anilist.title.language",
      "settings.anilist.title.account",
      "settings.anilist.title.romaji",
      "settings.anilist.title.english",
      "settings.anilist.title.native",
      "settings.anilist.adult",
      "settings.anilist.adult.description",
    ],
  },
  {
    tab: "general",
    section: "parse",
    titleKey: "settings.parse.titles",
    keys: [
      "settings.parse.player",
      "settings.parse.torrent",
      "settings.parse.search",
      "settings.torrent.covers",
      "settings.torrent.covers.off",
      "settings.torrent.covers.pages",
      "settings.torrent.covers.full",
      "settings.torrent.covers.login",
    ],
  },
  {
    tab: "general",
    section: "screenshot",
    titleKey: "settings.screenshot",
    keys: [
      "settings.screenshot.folder",
      "settings.screenshot.folder.hint",
      "settings.screenshot.format",
      "settings.screenshot.open.folder",
    ],
  },
  {
    tab: "general",
    section: "media",
    titleKey: "settings.media.title",
    keys: [
      "settings.media.video",
      "settings.media.audio",
      "settings.media.subtitles",
      "settings.media.tracks",
      "settings.media.tracks.hide",
      "settings.media.tracks.folders",
      "settings.media.tracks.torrent",
      "settings.media.streamQuality",
      "settings.media.streamQuality.hint",
      "settings.media.watcher",
      "settings.media.watcher.fast",
      "settings.media.watcher.calm",
      "settings.media.scanThreads",
      "settings.media.scanThreads.auto",
      "settings.media.scanThreads.two",
      "settings.media.scanThreads.four",
      "settings.media.scanThreads.six",
      "settings.media.scanThreads.eight",
      "settings.media.empty",
      "settings.media.reset",
    ],
  },
  {
    tab: "general",
    section: "reset",
    titleKey: "settings.reset.data",
    keys: ["settings.reset.button", "settings.reset.title", "settings.reset.message"],
  },
  {
    tab: "notifications",
    section: "system",
    titleKey: "settings.notifications.system",
    keys: [
      "settings.notifications.popups",
      "settings.notifications.popups.off",
      "settings.notifications.popups.system",
      "settings.notifications.popups.inapp",
      "settings.notifications.popups.both",
    ],
  },
  {
    tab: "notifications",
    section: "anilist",
    titleKey: "settings.notifications.group.anilist",
    keys: [
      "settings.anilist.release.notifications",
      "settings.notifications.episodes",
      "settings.notifications.statuses",
      "settings.notifications.media.status",
      "settings.notifications.subscribed",
      "settings.notifications.merge",
      "settings.notifications.sequel",
      "settings.notifications.interval",
      "settings.notifications.interval.min",
      "settings.notifications.lists",
      "settings.notifications.lists.refresh",
      "settings.notifications.lists.unavailable",
    ],
  },
  {
    tab: "notifications",
    section: "torrents",
    titleKey: "settings.notifications.group.torrents",
    keys: ["settings.notifications.torrent.health"],
  },
  {
    tab: "notifications",
    section: "tasks",
    titleKey: "settings.notifications.group.tasks",
    keys: [
      "settings.notifications.upscale",
      "settings.notifications.models",
      "settings.notifications.backup",
    ],
  },
  {
    tab: "notifications",
    section: "app",
    titleKey: "settings.notifications.group.app",
    keys: ["settings.notifications.scan"],
  },
  {
    tab: "search",
    section: "sources",
    titleKey: "settings.search.sources",
    keys: [
      "settings.search.default.source",
      "settings.search.visible.sources",
      "settings.search.no.visible.sources",
      "settings.search.proxy.per.source",
      "settings.search.proxy.webview",
      "settings.search.proxy.webview.hint",
      "settings.search.proxy.test.all",
    ],
  },
  {
    tab: "search",
    section: "results",
    titleKey: "settings.search.results",
    keys: [
      "settings.search.history.max",
      "settings.search.autocomplete.mode",
      "settings.search.autocomplete.mode.inline",
      "settings.search.autocomplete.mode.dropdown",
      "settings.search.autocomplete.mode.both",
      "settings.search.autocomplete.mode.off",
      "settings.search.autocomplete.mode.off.hint",
      "settings.search.preview",
      "settings.search.page.size",
      "settings.search.max.pages",
      "settings.search.learning",
      "settings.search.learning.history",
      "settings.search.learning.queries",
      "settings.search.learning.selected",
      "settings.search.learning.anime",
      "settings.search.toggles",
      "settings.search.toggle.sym.spell",
      "settings.search.toggle.sym.spell.hint",
      "settings.search.toggle.intent",
      "settings.search.toggle.intent.hint",
      "settings.search.anilist.boost",
      "settings.search.anilist.boost.off",
      "settings.search.anilist.boost.subtle",
      "settings.search.anilist.boost.strong",
      "settings.search.purge.expired",
      "settings.search.clear.torrent",
      "settings.search.clear.anilist",
      "settings.search.clear.player",
      "settings.search.clear.filter",
      "settings.search.clear.all.learning",
      "settings.search.reset.anime.suggestions",
    ],
  },
  {
    tab: "torrent",
    section: "limits",
    titleKey: "settings.torrent.speed.limits",
    keys: ["settings.torrent.dl.limit", "settings.torrent.ul.limit", "settings.torrent.no.limit"],
  },
  {
    tab: "torrent",
    section: "defaults",
    titleKey: "settings.torrent.defaults",
    keys: [
      "settings.torrent.default.download.dir",
      "settings.torrent.default.download.dir.hint",
      "settings.torrent.default.concurrent",
    ],
  },
  {
    tab: "torrent",
    section: "schedule",
    titleKey: "settings.torrent.schedule",
    keys: [
      "settings.torrent.schedule.enable",
      "settings.torrent.schedule.day",
      "settings.torrent.schedule.day.limits",
      "settings.torrent.schedule.night.limits",
    ],
  },
  {
    tab: "torrent",
    section: "search",
    titleKey: "settings.torrent.search",
    keys: ["settings.torrent.results.per.page"],
  },
  {
    tab: "torrent",
    section: "files",
    titleKey: "settings.torrent.files",
    keys: [
      "settings.torrent.file.order",
      "settings.torrent.file.order.list",
      "settings.torrent.file.order.torrent",
      "settings.torrent.file.order.description",
    ],
  },
  {
    tab: "torrent",
    section: "leftovers",
    titleKey: "settings.torrent.leftovers",
    keys: [
      "settings.torrent.leftovers.none",
      "settings.torrent.leftovers.count",
      "settings.torrent.leftovers.hint",
      "settings.torrent.leftovers.clear",
      "settings.torrent.leftovers.confirm",
      "settings.torrent.leftovers.clear.failed",
    ],
  },
  {
    tab: "torrent",
    section: "notifications",
    titleKey: "settings.torrent.notifications",
    keys: ["settings.torrent.on.complete", "settings.torrent.on.error"],
  },
  {
    tab: "torrent",
    section: "session",
    titleKey: "settings.torrent.session",
    keys: [
      "settings.torrent.session.restart.note",
      "settings.torrent.fastresume",
      "settings.torrent.disable.persistence",
    ],
  },
  {
    tab: "torrent",
    section: "network",
    titleKey: "settings.torrent.network",
    keys: [
      "settings.torrent.enable.upnp",
      "settings.torrent.dht.enabled",
      "settings.torrent.pex.enabled",
      "settings.torrent.ipv4.only",
      "settings.torrent.listen.port",
      "settings.torrent.listen.port.active",
      "settings.torrent.listen.port.idle",
      "settings.torrent.proxy.url",
      "settings.torrent.proxy.url.description",
      "settings.torrent.proxy.test",
      "settings.torrent.peer.connect.timeout",
      "settings.torrent.peer.readwrite.timeout",
      "settings.torrent.session.invalid",
      "settings.torrent.session.apply",
    ],
  },
  {
    tab: "theme",
    section: "themes",
    titleKey: "settings.theme",
    keys: [
      "settings.theme.create.title",
      "settings.theme.edit.title",
      "settings.theme.customize",
      "settings.theme.customize.reset",
      "settings.theme.family.anime",
      "settings.theme.family.brands",
      "settings.theme.family.custom",
      "settings.theme.family.editor",
      "settings.theme.family.terminal",
      "settings.theme.family.windows",
      "settings.theme.patch.export",
      "settings.theme.patch.hint",
      "settings.theme.import",
      "settings.theme.export",
      "settings.theme.edit",
      "settings.theme.delete",
      "settings.theme.name",
      "settings.theme.name.placeholder",
      "settings.theme.save",
      "settings.theme.palette",
      "settings.theme.palette.load",
      "settings.theme.palette.apply",
      "settings.theme.palette.empty",
      "settings.theme.palette.hint",
      "settings.theme.shape.radius",
      "settings.theme.shape.radius.none",
      "settings.theme.shape.radius.frame",
      "settings.theme.shape.radius.all",
      "settings.theme.shape.bevel",
      "settings.theme.shape.bevel.raised",
      "settings.theme.shape.bevel.flat",
      "settings.theme.shape.overlay",
      "settings.theme.shape.overlay.none",
      "settings.theme.shape.overlay.scanlines",
      "settings.theme.shape.overlay.grid",
      "settings.theme.autocomplete.opacity",
      "settings.theme.autocomplete.reset",
      "settings.theme.preview",
      "settings.theme.overrides",
      "settings.theme.override.reset",
      "settings.theme.override.progress",
      "settings.theme.override.fav",
      "settings.theme.override.graph.default",
      "settings.theme.override.graph.light",
      "settings.theme.override.graph.pale",
      "settings.theme.override.graph.prequel",
      "settings.theme.override.graph.sequel",
      "settings.theme.override.graph.side",
      "settings.theme.override.graph.spinoff",
      "settings.theme.override.torrent.downloading",
      "settings.theme.override.torrent.done",
      "settings.theme.override.torrent.error",
      "settings.theme.override.torrent.idle",
      "settings.theme.override.torrent.initializing",
      "settings.theme.override.torrent.missing",
      "settings.theme.override.torrent.seeding",
      "settings.theme.color.autocomplete",
      "settings.theme.color.background",
      "settings.theme.color.destructive",
      "settings.theme.color.field",
      "settings.theme.color.highlight",
      "settings.theme.color.link.hover",
      "settings.theme.color.muted",
      "settings.theme.color.primary",
      "settings.theme.color.secondary",
      "settings.theme.color.success",
      "settings.theme.color.surface",
      "settings.theme.color.text",
      "settings.theme.color.win.highlight",
      "settings.theme.color.win.shadow",
      "settings.theme.components.titlebarArt",
      "settings.theme.components.cardMeta",
      "settings.theme.components.cardMeta.full",
      "settings.theme.components.cardMeta.short",
    ],
  },
  {
    tab: "theme",
    section: "schedule",
    titleKey: "settings.theme.schedule",
    keys: [
      "settings.theme.schedule.enable",
      "settings.theme.schedule.day",
      "settings.theme.schedule.day.theme",
      "settings.theme.schedule.night.theme",
    ],
  },
  {
    tab: "theme",
    section: "retro",
    titleKey: "settings.theme.retro.style",
    keys: [
      "settings.theme.retro.classic",
      "settings.theme.retro.soft",
      "settings.theme.retro.contrast",
      "settings.theme.density",
      "settings.theme.density.comfortable",
      "settings.theme.density.compact",
      "settings.theme.collection.headers",
      "settings.theme.collection.headers.torrent",
      "settings.theme.collection.headers.folder",
    ],
  },
  {
    tab: "theme",
    section: "progress",
    titleKey: "settings.progress.style",
    keys: ["settings.progress.style.blocks", "settings.progress.style.solid"],
  },
  {
    tab: "theme",
    section: "font",
    titleKey: "settings.font.title",
    keys: ["settings.font.default"],
  },
  {
    tab: "theme",
    section: "effects",
    titleKey: "settings.theme.effects",
    keys: [
      "settings.theme.3d.borders",
      "settings.theme.button.press",
      "settings.theme.scrollbar",
      "settings.theme.backdrop",
    ],
  },
  {
    tab: "theme",
    section: "animation",
    titleKey: "settings.theme.animation",
    keys: [
      "settings.theme.modal.animation",
      "settings.theme.spinners",
      "settings.theme.animated.counters",
      "settings.theme.animate.toasts",
      "settings.theme.animate.sections",
      "settings.theme.animate.modal.content",
      "settings.theme.animate.osd",
      "settings.theme.animate.result.lists",
      "settings.theme.animate.tab.switch",
    ],
  },
  {
    tab: "theme",
    section: "experimental",
    titleKey: "settings.theme.experimental",
    keys: [
      "settings.theme.search",
      "settings.theme.search.default",
      "settings.theme.search.modern",
      "settings.theme.player",
      "settings.theme.player.default",
      "settings.theme.player.modern",
      "settings.theme.player.menu",
      "settings.theme.detail.width",
      "settings.theme.detail.width.default",
      "settings.theme.detail.width.wide",
      "settings.theme.experimental.mascot",
      "settings.theme.experimental.statusbar",
      "settings.theme.experimental.titlebar",
      "settings.theme.experimental.corners",
      "settings.theme.experimental.corners.hint",
      "settings.theme.experimental.scanlines",
      "settings.theme.experimental.effect",
      "settings.theme.experimental.effect.none",
      "settings.theme.experimental.effect.acrylic",
      "settings.theme.experimental.effect.mica",
      "settings.theme.experimental.effect.tabbed",
      "settings.theme.experimental.effect.hint",
      "settings.theme.experimental.effect.opacity",
      "settings.theme.experimental.effect.opacity.reset",
      "settings.theme.experimental.effect.opacity.warn",
    ],
  },
  {
    tab: "keybinds",
    section: "list",
    titleKey: "settings.keybinds",
    keys: [
      "settings.keybinds",
      "settings.keybinds.search",
      "settings.keybinds.scope",
      "settings.keybinds.scope.all",
      "settings.keybinds.scope.global",
      "settings.keybinds.scope.settings",
      "settings.keybinds.scope.player",
      "settings.keybinds.scope.vim",
      "settings.keybinds.scope.find",
      "settings.keybinds.scope.menu",
      "settings.keybinds.scope.tree",
      "settings.keybinds.empty",
      "settings.keybinds.column.binding",
      "settings.keybinds.column.action",
      "settings.keybinds.column.mode",
      "settings.keybinds.edit",
      "settings.keybinds.record.placeholder",
      "settings.keybinds.record.hint",
      "settings.keybinds.record.reserved",
      "settings.keybinds.record.reset",
      "settings.keybinds.record.clear",
      "settings.keybinds.conflicts.only",
      "settings.keybinds.record.current",
      "settings.keybinds.record.default",
      "settings.keybinds.record.conflict",
      "settings.keybinds.record.title",
      "settings.keybinds.record.action",
      "settings.keybinds.record.currentChord",
      "settings.keybinds.record.newChord",
      "settings.keybinds.record.conflictUsed",
      "settings.keybinds.reset.all",
      "settings.keybinds.reset.row",
      "settings.keybinds.capture",
      "settings.keybinds.shadowed",
      "settings.keybinds.unbound",
    ],
  },
];

export const SETTINGS_FIND_EXCLUDED_PREFIXES: readonly string[] = [
  "settings.sqlite",
  "settings.changelog",
  "settings.summary",
  "settings.find",
];

export const SETTINGS_FIND_SKIP_KEYS: readonly TranslationKey[] = [
  "settings.search.preview.typed",
  "settings.search.preview.ghost",
  "settings.search.autocomplete.footer.hint",
  "settings.theme.autocomplete.preview",
  "settings.theme.custom",
  "settings.theme.read.error",
  "settings.theme.import.error",
  "settings.theme.patch.base.error",
  "settings.theme.palette.error",
  "settings.font.load.error",
  "settings.torrent.session.save.failed",
  "settings.torrent.proxy.testing",
  "settings.torrent.proxy.test.ok",
  "settings.torrent.proxy.test.fail",
  "settings.tmdb.proxy.testing",
  "settings.tmdb.proxy.test.ok",
  "settings.tmdb.proxy.test.fail",
  "settings.anilist.proxy.testing",
  "settings.anilist.proxy.test.ok",
  "settings.anilist.proxy.test.fail",
  "settings.search.proxy.testing",
  "settings.search.proxy.test.ok",
  "settings.search.proxy.test.fail",
  "settings.tray.quit",
  "settings.reset.section",
];

function anchorId(tab: SettingsFindTab, section: string): string {
  return `${tab}.${section}`;
}

export function findSectionAnchor(tab: SettingsFindTab, section: string): string {
  return anchorId(tab, section);
}

export function findSectionTitleKey(sectionId: string): TranslationKey | null {
  return (
    FIND_GROUPS.find((group) => anchorId(group.tab, group.section) === sectionId)?.titleKey ?? null
  );
}

function buildEntries(): SettingsFindEntry[] {
  const entries: SettingsFindEntry[] = [];
  for (const tab of SETTINGS_FIND_TAB_ORDER) {
    entries.push({
      key: SETTINGS_FIND_TAB_TITLES[tab],
      tab,
      sectionId: anchorId(tab, FIND_GROUPS.find((group) => group.tab === tab)?.section ?? ""),
      kind: "tab",
    });
  }
  for (const group of FIND_GROUPS) {
    const sectionId = anchorId(group.tab, group.section);
    entries.push({ key: group.titleKey, tab: group.tab, sectionId, kind: "section" });
    for (const key of group.keys) {
      entries.push({ key, tab: group.tab, sectionId, kind: "setting" });
    }
  }
  return entries;
}

export const SETTINGS_FIND_ENTRIES: readonly SettingsFindEntry[] = buildEntries();

const RU: Record<string, string> = ruSettings;
const EN: Record<string, string> = enSettings;

function textOf(key: TranslationKey, locale: Locale): string {
  return (locale === "ru" ? RU : EN)[key] ?? "";
}

function scoreTokenIn(token: string, text: string): number | null {
  const direct = normalizeText(text).indexOf(token);
  return direct === -1 ? null : direct;
}

function rangesFor(text: string, tokens: readonly string[]): HighlightRange[] {
  const out: HighlightRange[] = [];
  for (const token of tokens) out.push(...findSubsequenceRanges(text, token));
  return out;
}

const KIND_ORDER: Record<SettingsFindKind, number> = { tab: 0, section: 1, setting: 2 };

export function searchSettingsFind(query: string): SettingsFindHit[] {
  const tokens = normalizeText(query)
    .split(/\s+/u)
    .filter((token) => token.length > 0);
  if (tokens.length === 0) return [];
  const hits: SettingsFindHit[] = [];
  for (const entry of SETTINGS_FIND_ENTRIES) {
    const labelRu = textOf(entry.key, "ru");
    const labelEn = textOf(entry.key, "en");
    let score = 0;
    let matchedRu = true;
    let matchedEn = true;
    let ok = true;
    for (const token of tokens) {
      const ruScore = scoreTokenIn(token, labelRu);
      const enScore = scoreTokenIn(token, labelEn);
      if (ruScore === null && enScore === null) {
        ok = false;
        break;
      }
      if (ruScore === null) matchedRu = false;
      if (enScore === null) matchedEn = false;
      score +=
        ruScore !== null && enScore !== null
          ? Math.min(ruScore, enScore)
          : (ruScore ?? enScore ?? 0);
    }
    if (!ok) continue;
    hits.push({
      entry,
      score,
      matchedRu,
      matchedEn,
      rangesRu: matchedRu ? rangesFor(labelRu, tokens) : [],
      rangesEn: matchedEn ? rangesFor(labelEn, tokens) : [],
    });
  }
  const tabRank = new Map<SettingsFindTab, number>(
    SETTINGS_FIND_TAB_ORDER.map((tab, index) => [tab, index])
  );
  hits.sort((a, b) => {
    const tabDelta = (tabRank.get(a.entry.tab) ?? 0) - (tabRank.get(b.entry.tab) ?? 0);
    if (tabDelta !== 0) return tabDelta;
    const kindDelta = KIND_ORDER[a.entry.kind] - KIND_ORDER[b.entry.kind];
    if (kindDelta !== 0) return kindDelta;
    if (a.score !== b.score) return a.score - b.score;
    return a.entry.key < b.entry.key ? -1 : a.entry.key > b.entry.key ? 1 : 0;
  });
  return hits;
}

export function findHitLabel(hit: SettingsFindHit, locale: Locale): string {
  return textOf(hit.entry.key, locale);
}

export function findHitRanges(hit: SettingsFindHit, locale: Locale): HighlightRange[] {
  return locale === "ru" ? hit.rangesRu : hit.rangesEn;
}

export function findHitMatched(hit: SettingsFindHit, locale: Locale): boolean {
  return locale === "ru" ? hit.matchedRu : hit.matchedEn;
}
