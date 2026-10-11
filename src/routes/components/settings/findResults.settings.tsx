import { cn } from "cn";
import { useEffect, useRef } from "react";

import { useI18n } from "@/hooks/i18n.hook";
import { splitByRanges } from "@/lib/highlight/highlight.utils";
import {
  SETTINGS_FIND_TAB_ORDER,
  SETTINGS_FIND_TAB_TITLES,
  findHitLabel,
  findHitMatched,
  findHitRanges,
  findSectionTitleKey,
} from "@/lib/settings/find.utils";
import type { SettingsFindHit } from "@/lib/settings/find.utils";
import type { Locale } from "@/types/i18n";
import type { HighlightRange } from "@/types/search";

function FindMarkedText({
  text,
  ranges,
  active,
}: {
  text: string;
  ranges: readonly HighlightRange[];
  active: boolean;
}) {
  const tokens = splitByRanges(text, ranges);
  if (tokens.length === 0) return <span>{text}</span>;
  return (
    <>
      {tokens.map((token, index) =>
        token.highlighted ? (
          <span
            key={index}
            className={cn(
              "font-bold",
              active ? "text-white underline" : "bg-highlight text-title-text"
            )}
          >
            {token.text}
          </span>
        ) : (
          <span key={index} className={active ? "text-white" : "text-text"}>
            {token.text}
          </span>
        )
      )}
    </>
  );
}

export function FindResults({
  hits,
  activeIndex,
  onActiveChange,
  onJump,
  listId,
}: {
  hits: readonly SettingsFindHit[];
  activeIndex: number;
  onActiveChange: (index: number) => void;
  onJump: (hit: SettingsFindHit) => void;
  listId: string;
}) {
  const { t, locale } = useI18n();
  const listRef = useRef<HTMLDivElement>(null);
  const other: Locale = locale === "ru" ? "en" : "ru";

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)
      ?.scrollIntoView?.({ block: "nearest" });
  }, [activeIndex]);

  if (hits.length === 0) {
    return <p className="text-hint windows95-text p-2 text-xs">{t("common.no.results")}</p>;
  }

  let rowIndex = -1;

  return (
    <div className="flex flex-col gap-1">
      <p className="windows95-text text-hint px-1 text-xs" role="status">
        {t("settings.find.results", { count: hits.length })}
      </p>
      <div
        ref={listRef}
        id={listId}
        role="listbox"
        tabIndex={-1}
        aria-label={t("settings.find.placeholder")}
        className="flex flex-col gap-2"
      >
        {SETTINGS_FIND_TAB_ORDER.map((tab) => {
          const tabHits = hits.filter((hit) => hit.entry.tab === tab);
          if (tabHits.length === 0) return null;
          return (
            <section key={tab} className="ui-panel">
              <div className="ui-titlebar">
                <span className="text-title-text font-bold">
                  {t(SETTINGS_FIND_TAB_TITLES[tab])}
                </span>
                <span className="text-title-text text-xs">({tabHits.length})</span>
              </div>
              <div className="flex flex-col gap-0.5 p-1">
                {tabHits.map((hit) => {
                  rowIndex += 1;
                  const index = rowIndex;
                  const active = index === activeIndex;
                  const matchedCurrent = findHitMatched(hit, locale);
                  const primaryLocale = matchedCurrent ? locale : other;
                  const sectionTitleKey = findSectionTitleKey(hit.entry.sectionId);
                  return (
                    <button
                      key={`${hit.entry.kind}:${hit.entry.key}`}
                      type="button"
                      role="option"
                      id={`${listId}-${index}`}
                      data-index={index}
                      tabIndex={-1}
                      aria-selected={active}
                      onMouseDown={(e) => e.preventDefault()}
                      onMouseEnter={() => onActiveChange(index)}
                      onClick={() => onJump(hit)}
                      className={cn(
                        "windows95-text focus-visible:outline-text block w-full cursor-pointer px-1.5 py-1 text-left text-xs focus-visible:outline-1 focus-visible:outline-offset-[-3px] focus-visible:outline-dotted",
                        active
                          ? "bg-highlight text-white"
                          : "text-text hover:bg-highlight hover:text-white"
                      )}
                    >
                      <span className="block">
                        <FindMarkedText
                          text={findHitLabel(hit, primaryLocale)}
                          ranges={findHitRanges(hit, primaryLocale)}
                          active={active}
                        />
                      </span>
                      <span
                        className={cn(
                          "mt-0.5 flex items-center gap-1 text-xs",
                          active ? "text-white" : "text-hint"
                        )}
                      >
                        {!matchedCurrent && (
                          <span className="border border-current px-0.5 leading-tight">
                            {primaryLocale.toUpperCase()}
                          </span>
                        )}
                        {hit.entry.kind === "setting" && sectionTitleKey
                          ? `${t(SETTINGS_FIND_TAB_TITLES[tab])} / ${t(sectionTitleKey)}`
                          : t(SETTINGS_FIND_TAB_TITLES[tab])}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
      <p className="text-hint windows95-text px-1 text-xs">{t("settings.find.footer.hint")}</p>
    </div>
  );
}
