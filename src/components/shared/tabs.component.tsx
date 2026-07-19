import { Button } from "@/components/ui/button.component";

function Tabs<T extends string>({
  tabs,
  activeTab,
  onChange,
}: {
  tabs: readonly { id: T; label: string }[];
  activeTab: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="flex bg-primary pl-2 pt-1 gap-1 shrink-0">
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <Button
            key={tab.id}
            className={`px-3 py-0.5 relative cursor-pointer windows95-text active:outline-dotted active:outline-1 active:outline-offset-[-3px] active:outline-text ${
              isActive
                ? "windows95-active-border border-b-transparent"
                : "windows95-small-border bg-surface"
            }`}
            style={{
              zIndex: isActive ? 20 : 10,
            }}
            onClick={() => onChange(tab.id)}
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
