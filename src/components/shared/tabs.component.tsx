import { cn } from "cn";
import { WifiOff } from "lucide-react";

import { Button } from "@/components/ui/button.component";
import { createListNavigationHandler } from "@/lib/utils/keyboard.utils";

import NotificationTray from "./notification/tray.notification";

export interface TabEntry<T extends string> {
  id: T;
  label: string;
  color?: string | null;
  disabled?: boolean;
  disabledReason?: string;
}

function resolveEnabledIndex<T extends string>(
  tabs: readonly TabEntry<T>[],
  index: number
): number {
  if (!tabs[index]?.disabled) return index;
  for (let step = 1; step < tabs.length; step += 1) {
    const forward = (index + step) % tabs.length;
    if (!tabs[forward]?.disabled) return forward;
  }
  return index;
}

function Tabs<T extends string>({
  tabs,
  activeTab,
  onChange,
  ariaLabel,
  onPrefetch,
}: {
  tabs: readonly TabEntry<T>[];
  activeTab: T;
  onChange: (id: T) => void;
  ariaLabel?: string;
  onPrefetch?: (id: T) => void;
}) {
  const handleKeyDown = createListNavigationHandler<HTMLDivElement>({
    activeIndex: tabs.findIndex((item) => item.id === activeTab),
    axis: "horizontal",
    count: tabs.length,
    setActiveIndex: () => {},
    onFocus: (index, event) => {
      const target = resolveEnabledIndex(tabs, index);
      if (tabs[target]?.disabled) return;
      onChange(tabs[target].id);
      const buttons = event.currentTarget.querySelectorAll<HTMLButtonElement>("[role=tab]");
      buttons?.[target]?.focus();
    },
  });

  return (
    <div className="flex max-w-full shrink-0 items-center gap-1 pt-1 pr-2 pl-2">
      <div
        className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto overflow-y-hidden"
        role="tablist"
        aria-label={ariaLabel}
        tabIndex={0}
        onKeyDown={handleKeyDown}
      >
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          const tabDisabled = tab.disabled ?? false;
          return (
            <Button
              key={tab.id}
              className={cn(
                "windows95-text active:outline-text relative cursor-pointer px-3 py-0.5 active:outline-1 active:outline-offset-[-3px] active:outline-dotted",
                isActive
                  ? "windows95-active-border border-b-transparent"
                  : "windows95-small-border bg-surface"
              )}
              style={{
                zIndex: isActive ? 20 : 10,
              }}
              title={tabDisabled ? (tab.disabledReason ?? tab.label) : tab.label}
              onClick={() => {
                if (!isActive && !tabDisabled) onChange(tab.id);
              }}
              onMouseEnter={() => {
                if (!tabDisabled) onPrefetch?.(tab.id);
              }}
              onFocus={() => {
                if (!tabDisabled) onPrefetch?.(tab.id);
              }}
              role="tab"
              aria-selected={isActive}
              aria-disabled={tabDisabled}
              tabIndex={isActive ? 0 : -1}
              disabled={isActive || tabDisabled}
            >
              {tab.color && (
                <span
                  className="windows95-border inline-block size-2.5 shrink-0"
                  style={{ backgroundColor: tab.color }}
                  aria-hidden
                />
              )}
              {tabDisabled && <WifiOff className="size-3 shrink-0" aria-hidden />}
              {tab.label}
            </Button>
          );
        })}
      </div>
      <NotificationTray />
    </div>
  );
}

export default Tabs;
