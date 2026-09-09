import { cn } from "cn";

import { Button } from "@/components/ui/button.component";
import { createListNavigationHandler } from "@/lib/utils/keyboard.utils";

function Tabs<T extends string>({
  tabs,
  activeTab,
  onChange,
  ariaLabel,
}: {
  tabs: readonly { id: T; label: string }[];
  activeTab: T;
  onChange: (id: T) => void;
  ariaLabel?: string;
}) {
  const handleKeyDown = createListNavigationHandler<HTMLDivElement>({
    activeIndex: tabs.findIndex((item) => item.id === activeTab),
    axis: "horizontal",
    count: tabs.length,
    setActiveIndex: () => {},
    onFocus: (index, event) => {
      onChange(tabs[index].id);
      const buttons = event.currentTarget.querySelectorAll<HTMLButtonElement>("[role=tab]");
      buttons?.[index]?.focus();
    },
  });

  return (
    <div
      className="flex max-w-full shrink-0 gap-1 overflow-x-auto pt-1 pl-2"
      role="tablist"
      aria-label={ariaLabel}
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
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
            onClick={() => {
              if (!isActive) onChange(tab.id);
            }}
            role="tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            disabled={isActive}
          >
            {tab.label}
          </Button>
        );
      })}
    </div>
  );
}

export default Tabs;
