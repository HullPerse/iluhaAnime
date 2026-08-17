import { Button } from "@/components/ui/button.component";
import { createListNavigationHandler } from "@/lib/keyboard.utils";

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
  return (
    <div
      className="bg-primary flex max-w-full shrink-0 gap-1 overflow-x-auto pt-1 pl-2"
      role="tablist"
      aria-label={ariaLabel}
    >
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <Button
            key={tab.id}
            className={`windows95-text active:outline-text relative cursor-pointer px-3 py-0.5 active:outline-1 active:outline-offset-[-3px] active:outline-dotted ${
              isActive
                ? "windows95-active-border border-b-transparent"
                : "windows95-small-border bg-surface"
            }`}
            style={{
              zIndex: isActive ? 20 : 10,
            }}
            onClick={() => {
              if (!isActive) onChange(tab.id);
            }}
            aria-disabled={isActive}
            onKeyDown={createListNavigationHandler({
              activeIndex: tabs.findIndex((item) => item.id === tab.id),
              axis: "horizontal",
              count: tabs.length,
              setActiveIndex: () => {},
              onFocus: (index, event) => {
                onChange(tabs[index].id);
                const tabList = event.currentTarget.parentElement;
                const buttons =
                  tabList?.querySelectorAll<HTMLButtonElement>("[role=tab]");
                buttons?.[index]?.focus();
              },
            })}
            role="tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            data-tab-id={tab.id}
          >
            {tab.label}
          </Button>
        );
      })}
    </div>
  );
}

export default Tabs;
