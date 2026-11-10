import { ListFilter, ListFilterPlus } from "lucide-react";
import type { ReactNode } from "react";
import { lazy, Suspense, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";

import { TabLoader } from "@/components/shared/loader/tab.loader";
import { Button } from "@/components/ui/button.component";
import { INTERNAL_SETTING_KEYS } from "@/config/settings/internalKeys.config";
import { DEFAULT_SETTINGS } from "@/config/settings/settingsDefaults.config";
import { SETTINGS_TAB_GROUPS, SETTINGS_TAB_KEYS } from "@/config/settings/tabs.config";
import { useResolvedHotkeys } from "@/hooks/hotkeys.hook";
import { useI18n } from "@/hooks/i18n.hook";
import { useSettingsSnapshot } from "@/hooks/settingsSnapshot.hook";
import { flashTarget } from "@/lib/core/ui/flash.utils";
import { getLastSettingsTab, setLastSettingsTab } from "@/lib/ui/settingsTab.utils";
import { ignoreTabCycle, stepTabId } from "@/lib/ui/tabsHotkeys.utils";

import { searchSettingsFind } from "@/lib/core/search/find.utils";
import { keysOf } from "@/lib/core/hotkeys/keysOf.utils";
import { sectionSettingKeys } from "@/lib/core/system/reset.utils";
import type { SettingsFindHit, SettingsFindTab } from "@/types/core/find";
import { useCell } from "@hullperse/hp_utils/react";
import { settingsRoute } from "@/routes/__root";
import { SettingsChangelog } from "@/routes/components/settings/changelog.settings";
import { FindBox } from "@/routes/components/settings/findBox.settings";
import { FindResults } from "@/routes/components/settings/findResults.settings";
import SettingsGeneral from "@/routes/components/settings/general.settings";
import { SettingsKeybinds } from "@/routes/components/settings/keybinds.settings";
import SettingsNotifications from "@/routes/components/settings/notifications.settings";
import SettingsSearch from "@/routes/components/settings/search.settings";
import SettingsProxy from "@/routes/components/settings/proxy.settings";
import { SettingsSummary } from "@/routes/components/settings/summary.settings";
import SettingsTheme from "@/routes/components/settings/theme.settings";
import SettingsTorrent from "@/routes/components/settings/torrent.settings";
import { settingsAtoms } from "@/store/settings.store";
import type { TranslationKey } from "@/types/core/i18n";
import type { SettingsTab } from "@/types/ui/settings";

const SettingsSqlite = lazy(() => import("@/routes/components/settings/sqlite/sqlite.settings"));

const FIND_LIST_ID = "settings-find-listbox";
const INTERNAL_KEYS = new Set<string>(INTERNAL_SETTING_KEYS);
const TAB_TITLE_KEYS = new Map<SettingsTab, TranslationKey>(
  SETTINGS_TAB_KEYS.map((entry) => [entry.id, entry.key])
);

export default function SettingsRoute() {
  const { t } = useI18n();
  const sqliteBrowserEnabled = useCell(settingsAtoms.sqliteBrowserEnabled);
  const animateTabSwitch = useCell(settingsAtoms.animateTabSwitch);
  const navigate = settingsRoute.useNavigate();
  const activeTab = settingsRoute.useSearch().tab;
  const [findQuery, setFindQuery] = useState<string>("");
  const [findOpen, setFindOpen] = useState<boolean>(false);
  const [findActive, setFindActive] = useState<number>(0);
  const [flashRequest, setFlashRequest] = useState<{ sectionId: string } | null>(null);
  const [expandedSectionIds, setExpandedSectionIds] = useState<Set<string>>(new Set());
  const [changedOnly, setChangedOnly] = useState<boolean>(false);
  const settingsSnapshot = useSettingsSnapshot();
  const contentRef = useRef<HTMLDivElement>(null);
  const findInputRef = useRef<HTMLInputElement>(null);
  const deferredQuery = useDeferredValue(findQuery);
  const trimmedQuery = findQuery.trim();
  const findHits = useMemo(() => searchSettingsFind(deferredQuery), [deferredQuery]);
  const findCounts = useMemo(() => {
    const counts = new Map<SettingsFindTab, number>();
    if (trimmedQuery.length === 0) return counts;
    for (const hit of findHits) {
      counts.set(hit.entry.tab, (counts.get(hit.entry.tab) ?? 0) + 1);
    }
    return counts;
  }, [findHits, trimmedQuery]);
  const navGroups = useMemo(
    () =>
      SETTINGS_TAB_GROUPS.map((group) => ({
        ...group,
        tabs: group.tabs.filter((tab) => tab !== "sqlite" || sqliteBrowserEnabled),
      })).filter((group) => group.tabs.length > 0),
    [sqliteBrowserEnabled]
  );
  const navTabs = useMemo(() => navGroups.flatMap((group) => group.tabs), [navGroups]);
  const changedKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const key of keysOf(DEFAULT_SETTINGS)) {
      if (INTERNAL_KEYS.has(key)) continue;
      if (JSON.stringify(settingsSnapshot[key]) !== JSON.stringify(DEFAULT_SETTINGS[key])) {
        keys.add(key);
      }
    }
    return keys;
  }, [settingsSnapshot]);
  const tabContentRef = useRef<HTMLDivElement>(null);
  const prevTabRef = useRef<SettingsTab | null>(null);
  useEffect(() => {
    if (!animateTabSwitch || tabContentRef.current === null) return;
    if (prevTabRef.current !== null && prevTabRef.current !== activeTab) {
      tabContentRef.current.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: 150,
        easing: "ease-out",
      });
    }
    prevTabRef.current = activeTab;
  }, [activeTab, animateTabSwitch]);
  useEffect(() => {
    if (!sqliteBrowserEnabled && activeTab === "sqlite") {
      navigate({ search: (prev) => ({ ...prev, tab: "general" }) });
    }
  }, [activeTab, sqliteBrowserEnabled, navigate]);

  const handleFindChange = (value: string) => {
    setFindQuery(value);
    setFindOpen(value.trim().length > 0);
    setFindActive(0);
  };

  const handleFindJump = (hit: SettingsFindHit) => {
    navigate({ search: (prev) => ({ ...prev, tab: hit.entry.tab }) });
    setFindOpen(false);
    setFlashRequest({ sectionId: hit.entry.sectionId });
    setExpandedSectionIds((prev) => new Set(prev).add(hit.entry.sectionId));
  };

  const handleJumpSelected = () => {
    const hit = findHits[findActive] ?? findHits[0];
    if (hit) handleFindJump(hit);
  };

  const handleTabSelect = (tab: SettingsTab) => {
    setLastSettingsTab(tab);
    navigate({ search: (prev) => ({ ...prev, tab }) });
    setFindOpen(false);
  };

  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;
    const panel = content.querySelector(`[data-active-tab="${CSS.escape(activeTab)}"]`);
    if (panel instanceof HTMLElement) content.scrollTo({ top: 0 });
  }, [activeTab]);

  useEffect(() => {
    if (getLastSettingsTab() === null) setLastSettingsTab(activeTab);
  }, [activeTab]);

  useResolvedHotkeys<"focus-find">(
    [{ id: "focus-find", chord: "ctrl+KeyK", repeat: "once", keybindId: "focus.main" }],
    {
      onAction: () => findInputRef.current?.focus(),
    }
  );
  useResolvedHotkeys<"tab-prev" | "tab-next">(
    [
      { id: "tab-prev", chord: "Shift+BracketLeft", repeat: "once", keybindId: "tab.prev" },
      { id: "tab-next", chord: "Shift+BracketRight", repeat: "once", keybindId: "tab.next" },
    ],
    {
      ignore: (event) => ignoreTabCycle(event),
      onAction: (id) => {
        const next = stepTabId(navTabs, activeTab, id === "tab-next" ? 1 : -1);
        if (next) handleTabSelect(next);
      },
    }
  );

  useEffect(() => {
    if (findOpen) contentRef.current?.scrollTo({ top: 0 });
  }, [findOpen]);

  useEffect(() => {
    const content = contentRef.current;
    if (!content || findOpen) return;
    const matched = new Set(
      trimmedQuery.length === 0
        ? []
        : findHits.filter((hit) => hit.entry.tab === activeTab).map((hit) => hit.entry.sectionId)
    );
    for (const section of content.querySelectorAll("[data-find-section]")) {
      if (!(section instanceof HTMLElement)) continue;
      const id = section.dataset.findSection;
      section.classList.toggle("target-marked", Boolean(id && matched.has(id)));
    }
  }, [activeTab, findOpen, findHits, trimmedQuery]);

  useEffect(() => {
    const panel = contentRef.current?.querySelector(`[data-active-tab="${CSS.escape(activeTab)}"]`);
    if (!(panel instanceof HTMLElement) || findOpen) return;
    for (const section of panel.querySelectorAll("[data-find-section]")) {
      if (!(section instanceof HTMLElement)) continue;
      const id = section.dataset.findSection;
      const keys = id === undefined ? [] : sectionSettingKeys(id);
      section.hidden =
        changedOnly &&
        changedKeys.size > 0 &&
        keys.length > 0 &&
        !keys.some((key) => changedKeys.has(key));
    }
  }, [activeTab, changedKeys, changedOnly, findOpen]);

  useEffect(() => {
    const panel = contentRef.current?.querySelector(`[data-active-tab="${CSS.escape(activeTab)}"]`);
    if (!(panel instanceof HTMLElement) || findOpen || flashRequest === null) return;
    const target = panel.querySelector(
      `[data-find-section="${CSS.escape(flashRequest.sectionId)}"]`
    );
    if (!(target instanceof HTMLElement)) return;
    target.scrollIntoView({ block: "start" });
    return flashTarget(target);
  }, [activeTab, findOpen, flashRequest]);

  const components: Record<SettingsTab, ReactNode> = {
    general: <SettingsGeneral />,
    notifications: <SettingsNotifications />,
    torrent: <SettingsTorrent />,
    proxy: <SettingsProxy />,
    search: <SettingsSearch />,
    theme: <SettingsTheme />,
    keybinds: <SettingsKeybinds expandedSectionIds={expandedSectionIds} />,
    changelog: <SettingsChangelog />,
    sqlite: (
      <Suspense fallback={<TabLoader className="min-h-40" />}>
        <SettingsSqlite />
      </Suspense>
    ),
  };

  return (
    <div className="flex h-full flex-row gap-1">
      <nav
        aria-label={t("common.sections")}
        className="windows95-border bg-field flex w-44 shrink-0 scrollbar-gutter-stable flex-col gap-1 overflow-y-auto p-1"
      >
        {navGroups.map((group) => {
          const groupActive = group.tabs.includes(activeTab);
          return (
            <div key={group.id} className="flex flex-col gap-0.5">
              <Button
                className={
                  groupActive
                    ? "bg-secondary flex w-full justify-start text-xs font-bold text-white"
                    : "flex w-full justify-start text-xs"
                }
                disabled={groupActive}
                onClick={() => {
                  const first = group.tabs[0];
                  if (first !== undefined && !groupActive) handleTabSelect(first);
                }}
              >
                <span className="min-w-0 flex-1 truncate text-left">{t(group.titleKey)}</span>
              </Button>
              {groupActive && (
                <div className="border-muted ml-2 flex flex-col gap-0.5 border-l pl-1.5">
                  {group.tabs.map((tabId) => {
                    const active = activeTab === tabId;
                    return (
                      <Button
                        key={tabId}
                        className={
                          active
                            ? "bg-highlight flex w-full justify-start border-transparent text-xs text-white"
                            : "flex w-full justify-start text-xs"
                        }
                        aria-current={active && "page"}
                        onClick={() => handleTabSelect(tabId)}
                        disabled={active}
                      >
                        <span className="min-w-0 flex-1 truncate text-left">
                          {t(TAB_TITLE_KEYS.get(tabId) ?? "settings.general")}
                        </span>
                        {(findCounts.get(tabId as SettingsFindTab) ?? 0) > 0 && (
                          <span
                            className={
                              active
                                ? "ml-1 shrink-0 px-1 text-xs text-white tabular-nums"
                                : "bg-highlight ml-1 shrink-0 px-1 text-xs text-white tabular-nums"
                            }
                          >
                            {findCounts.get(tabId as SettingsFindTab)}
                          </span>
                        )}
                      </Button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>
      <div
        ref={contentRef}
        data-scroll-root
        className="windows95-border bg-primary min-h-0 min-w-0 flex-1 scrollbar-gutter-stable overflow-auto p-1"
      >
        <div className="bg-primary sticky -top-1 z-10 -mx-1 px-1 pt-1 pb-1">
          <div className="flex flex-wrap items-center gap-2">
            <div className="min-w-48 flex-1">
              <FindBox
                value={findQuery}
                onChange={handleFindChange}
                onJumpSelected={handleJumpSelected}
                optionCount={findHits.length}
                activeIndex={findActive}
                onActiveChange={setFindActive}
                listId={FIND_LIST_ID}
                inputRef={findInputRef}
              />
            </div>
            {changedKeys.size > 0 && (
              <Button
                variant={changedOnly ? "default" : "secondary"}
                className="size-6 p-0"
                aria-pressed={changedOnly}
                aria-label={t("settings.changed.only")}
                title={t("settings.changed.only")}
                onClick={() => setChangedOnly((prev) => !prev)}
              >
                {changedOnly ? (
                  <ListFilter className="size-4" />
                ) : (
                  <ListFilterPlus className="size-4" />
                )}
              </Button>
            )}
            <span className="text-hint windows95-text text-xs">{t("settings.autosave")}</span>
          </div>
        </div>
        <div hidden={findOpen} ref={tabContentRef} data-active-tab={activeTab}>
          {components[activeTab]}
        </div>
        {findOpen && (
          <FindResults
            hits={findHits}
            activeIndex={findActive}
            onActiveChange={setFindActive}
            onJump={handleFindJump}
            listId={FIND_LIST_ID}
          />
        )}
      </div>
      <div className="hidden lg:flex">
        <SettingsSummary onJump={handleTabSelect} />
      </div>
    </div>
  );
}
