import { PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import type { DragEndEvent, DragStartEvent } from "@dnd-kit/core";
import { useCallback, useState } from "react";

import { useCategoryStore } from "@/store/category.store";
import type { CategoryDragData } from "@/types/category";

export function usePlayerDrag() {
  const [activeDrag, setActiveDrag] = useState<{ name: string } | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const data = event.active.data.current as Partial<CategoryDragData> | undefined;
    setActiveDrag(data?.name ? { name: data.name } : null);
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    setActiveDrag(null);
    if (!over) return;
    const data = active.data.current as CategoryDragData | undefined;
    if (!data) return;
    useCategoryStore.getState().addEntry(String(over.id), data);
  }, []);

  const handleDragCancel = useCallback(() => setActiveDrag(null), []);

  return { activeDrag, sensors, handleDragStart, handleDragEnd, handleDragCancel };
}
