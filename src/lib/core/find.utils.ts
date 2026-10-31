import { findSubsequenceRanges, normalizeText } from "@/lib/core/highlight.utils";
import {
  FIND_GROUPS,
  SETTINGS_FIND_ENTRIES,
  SETTINGS_FIND_TAB_ORDER,
  anchorId,
} from "@/config/settings/find.config";
import enSettings from "@/lib/locale/en/settings.locale";
import ruSettings from "@/lib/locale/ru/settings.locale";
import type { Locale, TranslationKey } from "@/types/core/i18n";
import type { HighlightRange } from "@/types/search/search";
import type { SettingsFindHit, SettingsFindKind, SettingsFindTab } from "@/types/core/find";

export function findSectionAnchor(tab: SettingsFindTab, section: string): string {
  return anchorId(tab, section);
}

export function findSectionTitleKey(sectionId: string): TranslationKey | null {
  return (
    FIND_GROUPS.find((group) => anchorId(group.tab, group.section) === sectionId)?.titleKey ?? null
  );
}

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
    if (a.entry.key < b.entry.key) return -1;
    if (a.entry.key > b.entry.key) return 1;
    return 0;
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
