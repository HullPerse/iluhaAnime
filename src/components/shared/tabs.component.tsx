import {
  DndContext,
  DragOverlay,
  MouseSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
} from "@dnd-kit/core";
import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "cn";
import { WifiOff } from "lucide-react";

import { Button } from "@/components/ui/button.component";
import { createListNavigationHandler } from "@/lib/ui/keyboard.utils";
import { resolveEnabledIndex } from "@/lib/ui/tabsIndex.utils";

interface TabEntry<T extends string> {
  id: T;
  label: string;
  color?: string | null;
  badge?: number;
  disabled?: boolean;
  disabledReason?: string;
}

function TabDragTarget({
  id,
  enabled,
  children,
}: {
  id: string;
  enabled: boolean;
  children: ReactNode;
}) {
  const drag = useDraggable({ id, disabled: !enabled });
  const drop = useDroppable({ id, disabled: !enabled });

  return (
    <div
      ref={(node) => {
        drag.setNodeRef(node);
        drop.setNodeRef(node);
      }}
      className={cn(
        "shrink-0",
        drag.isDragging && "opacity-40",
        drop.isOver && !drag.isDragging && "outline-highlight outline-1"
      )}
      {...drag.listeners}
    >
      {children}
    </div>
  );
}

function Tabs<T extends string>({
  tabs,
  activeTab,
  onChange,
  ariaLabel,
  onPrefetch,
  onReorder,
}: {
  tabs: readonly TabEntry<T>[];
  activeTab: T;
  onChange: (id: T) => void;
  ariaLabel?: string;
  onPrefetch?: (id: T) => void;
  onReorder?: (from: T, to: T) => void;
}) {
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { delay: 250, tolerance: 5 } })
  );
  const [dragged, setDragged] = useState<string | number | null>(null);
  const draggedTab = tabs.find((tab) => tab.id === dragged);
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
    <DndContext
      sensors={sensors}
      onDragStart={({ active }) => setDragged(active.id)}
      onDragCancel={() => setDragged(null)}
      onDragEnd={({ active, over }) => {
        setDragged(null);

        if (over && active.id !== over.id) onReorder?.(active.id as T, over.id as T);
      }}
    >
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
            <TabDragTarget key={tab.id} id={tab.id} enabled={!!onReorder}>
              <Button
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
                disabled={!onReorder && (isActive || tabDisabled)}
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
                {tab.badge != null && tab.badge > 0 && (
                  <span
                    className="bg-destructive windows95-font ml-1 inline-flex min-w-4 items-center justify-center px-0.5 text-xs text-white"
                    aria-label={`${tab.badge}`}
                  >
                    {tab.badge > 99 ? "99+" : tab.badge}
                  </span>
                )}
              </Button>
            </TabDragTarget>
          );
        })}
      </div>
      {onReorder &&
        typeof document !== "undefined" &&
        createPortal(
          <DragOverlay dropAnimation={null} zIndex={10000}>
            {draggedTab && (
              <div className="windows95-small-border bg-surface windows95-text px-3 py-0.5">
                {draggedTab.label}
              </div>
            )}
          </DragOverlay>,
          document.body
        )}
    </DndContext>
  );
}

export default Tabs;
