import * as z from "zod/mini";

import type { TranslationKey } from "@/types/core/i18n";
import type { SettingsFindEntry, SettingsFindTab } from "@/types/core/find";
import data from "./find.data.json";

interface FindGroup {
  tab: SettingsFindTab;
  section: string;
  titleKey: TranslationKey;
  keys: readonly TranslationKey[];
}

const FindGroupSchema = z.object({
  keys: z.array(z.string()),
  section: z.string(),
  tab: z.string(),
  titleKey: z.string(),
});

const FindDataSchema = z.object({
  FIND_GROUPS: z.array(FindGroupSchema),
  SETTINGS_FIND_EXCLUDED_PREFIXES: z.array(z.string()),
  SETTINGS_FIND_SKIP_KEYS: z.array(z.string()),
  SETTINGS_FIND_TAB_ORDER: z.array(z.string()),
  SETTINGS_FIND_TAB_TITLES: z.record(z.string(), z.string()),
});

const parsed = FindDataSchema.parse(data);

export const SETTINGS_FIND_TAB_ORDER = parsed.SETTINGS_FIND_TAB_ORDER as readonly SettingsFindTab[];

export const SETTINGS_FIND_TAB_TITLES = parsed.SETTINGS_FIND_TAB_TITLES as Record<
  SettingsFindTab,
  TranslationKey
>;

export const FIND_GROUPS = parsed.FIND_GROUPS as readonly FindGroup[];

export const SETTINGS_FIND_EXCLUDED_PREFIXES =
  parsed.SETTINGS_FIND_EXCLUDED_PREFIXES as readonly string[];

export const SETTINGS_FIND_SKIP_KEYS = parsed.SETTINGS_FIND_SKIP_KEYS as readonly TranslationKey[];

export function anchorId(tab: SettingsFindTab, section: string): string {
  return `${tab}:${section}`;
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
