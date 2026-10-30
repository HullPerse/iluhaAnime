import type { ReactNode } from "react";
import { lazy, Suspense, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";

import { TabLoader } from "@/components/shared/loader/tab.loader";
import { Button } from "@/components/ui/button.component";
import { SETTINGS_TAB_KEYS } from "@/config/settings/tabs.config";
import { useResolvedHotkeys } from "@/hooks/hotkeys.hook";
import { useI18n } from "@/hooks/i18n.hook";
import { flashTarget } from "@/lib/core/flash.utils";
import { ignoreTabCycle, stepTabId } from "@/lib/ui/tabsHotkeys.utils";
import type { TranslationKey } from "@/lib/locale/i18n.utils";
import { searchSettingsFind } from "@/lib/core/find.utils";
import type { SettingsFindHit, SettingsFindTab } from "@/types/core/find";
import { useCell } from "@/lib/core/signal.hook";
import { settingsRoute } from "@/routes/__root";
import { SettingsChangelog } from "@/routes/components/settings/changelog.settings";
import { FindBox } from "@/routes/components/settings/findBox.settings";
import { FindResults } from "@/routes/components/settings/findResults.settings";
import SettingsGeneral from "@/routes/components/settings/general.settings";
import { SettingsKeybinds } from "@/routes/components/settings/keybinds.settings";
import SettingsNotifications from "@/routes/components/settings/notifications.settings";
import SettingsSearch from "@/routes/components/settings/search.settings";
import { SettingsSummary } from "@/routes/components/settings/summary.settings";
import SettingsTheme from "@/routes/components/settings/theme.settings";
import SettingsTorrent from "@/routes/components/settings/torrent.settings";
import { settingsAtoms } from "@/store/settings.store";
import type { SettingsTab } from "@/types/ui/settings";

const SettingsSqlite = lazy(() => import("@/routes/components/settings/sqlite/sqlite.settings"));

const FIND_LIST_ID = "settings-find-listbox";

export default function SettingsRoute() {
  const { t } = useI18n();
  const sqliteBrowserEnabled = useCell(settingsAtoms.sqliteBrowserEnabled);
  const animateTabSwitch = useCell(settingsAtoms.animateTabSwitch);
  const navigate = settingsRoute.useNavigate();
  const activeTab = settingsRoute.useSearch().tab;
  const [findQuery, setFindQuery] = useState("");
  const [findOpen, setFindOpen] = useState(false);
  const [findActive, setFindActive] = useState(0);
  const [flashSection, setFlashSection] = useState<string | null>(null);
  const [flashNonce, setFlashNonce] = useState(0);
  const [expandedSectionIds, setExpandedSectionIds] = useState<Set<string>>(new Set());
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
  const navKeys = sqliteBrowserEnabled
    ? [...SETTINGS_TAB_KEYS, { id: "sqlite" as const, key: "settings.sqlite" as TranslationKey }]
    : SETTINGS_TAB_KEYS;
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
  };

  const handleFindJump = (hit: SettingsFindHit) => {
    navigate({ search: (prev) => ({ ...prev, tab: hit.entry.tab }) });
    setFindOpen(false);
    setFlashSection(hit.entry.sectionId);
    setFlashNonce((nonce) => nonce + 1);
    setExpandedSectionIds((prev) => new Set(prev).add(hit.entry.sectionId));
  };

  const handleJumpSelected = () => {
    const hit = findHits[findActive] ?? findHits[0];
    if (hit) handleFindJump(hit);
  };

  const handleTabSelect = (tab: SettingsTab) => {
    navigate({ search: (prev) => ({ ...prev, tab }) });
    setFindOpen(false);
  };

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
        const next = stepTabId(
          navKeys.map((tab) => tab.id),
          activeTab,
          id === "tab-next" ? 1 : -1
        );
        if (next) handleTabSelect(next);
      },
    }
  );

  useEffect(() => {
    if (findOpen) contentRef.current?.scrollTo({ top: 0 });
  }, [findOpen]);

  useEffect(() => {
    setFindActive(0);
  }, [findHits]);

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
    const content = contentRef.current;
    if (!content || findOpen || flashSection === null) return;
    const target = content.querySelector(`[data-find-section="${CSS.escape(flashSection)}"]`);
    if (!(target instanceof HTMLElement)) return;
    target.scrollIntoView({ block: "start" });
    return flashTarget(target);
  }, [activeTab, findOpen, flashSection, flashNonce]);

  const components: Record<SettingsTab, ReactNode> = {
    general: <SettingsGeneral />,
    notifications: <SettingsNotifications />,
    torrent: <SettingsTorrent />,
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
        className="windows95-border bg-field flex w-34 shrink-0 flex-col gap-0.5 overflow-y-auto p-1"
      >
        {navKeys.map((tab) => (
          <Button
            key={tab.id}
            className="justify-start text-xs"
            aria-current={activeTab === tab.id}
            onClick={() => handleTabSelect(tab.id)}
            disabled={activeTab === tab.id}
          >
            <span className="min-w-0 flex-1 truncate text-left">{t(tab.key)}</span>
            {(findCounts.get(tab.id as SettingsFindTab) ?? 0) > 0 && (
              <span className="bg-highlight ml-1 shrink-0 px-1 text-xs text-white tabular-nums">
                {findCounts.get(tab.id as SettingsFindTab)}
              </span>
            )}
          </Button>
        ))}
      </nav>
      <div
        ref={contentRef}
        data-scroll-root
        className="windows95-border bg-primary min-h-0 min-w-0 flex-1 overflow-auto p-1"
      >
        <div className="bg-primary sticky -top-1 z-10 -mx-1 px-1 pt-1 pb-1">
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
        <div hidden={findOpen} ref={tabContentRef}>
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
