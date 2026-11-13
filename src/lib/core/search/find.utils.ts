import { findSubsequenceRanges, normalizeText } from "@hullperse/hp_utils/highlight";
import {
  FIND_GROUPS,
  SETTINGS_FIND_ENTRIES,
  SETTINGS_FIND_TAB_ORDER,
  anchorId,
} from "@/config/settings/find.config";
import ruSettings from "@/lib/locale/ru/settings.locale";
import type { TranslationKey } from "@/types/core/i18n";
import type { HighlightRange } from "@/types/search/search";
import type { SettingsFindHit, SettingsFindKind, SettingsFindTab } from "@/types/core/find";

export function findSectionTitleKey(sectionId: string): TranslationKey | null {
  return (
    FIND_GROUPS.find((group) => anchorId(group.tab, group.section) === sectionId)?.titleKey ?? null
  );
}

const RU: Record<string, string> = ruSettings;

function textOf(key: TranslationKey): string {
  return RU[key] ?? "";
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
    const label = textOf(entry.key);
    let score = 0;
    let matched = true;
    for (const token of tokens) {
      const tokenScore = scoreTokenIn(token, label);
      if (tokenScore === null) {
        matched = false;
        break;
      }
      score += tokenScore;
    }
    if (!matched) continue;
    hits.push({
      entry,
      score,
      matchedRu: true,
      rangesRu: rangesFor(label, tokens),
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

export function findHitLabel(hit: SettingsFindHit): string {
  return textOf(hit.entry.key);
}

export function findHitRanges(hit: SettingsFindHit): HighlightRange[] {
  return hit.rangesRu;
}
