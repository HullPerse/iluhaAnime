import { GripVertical } from "lucide-react";
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { useCell } from "@hullperse/hp_utils/react";
import { useState } from "react";
import { createPortal } from "react-dom";
import { Checkbox } from "@/components/ui/checkbox.component";
import { TAB_KEYS, orderMainTabs } from "@/config/settings/tabs.config";
import { useI18n } from "@/hooks/i18n.hook";
import MangaStatusRow from "@/routes/components/manga/status/row.status";
import { patchSettings, settingsAtoms } from "@/store/settings.store";
import type { TabId } from "@/types/ui/settings";

export default function MainTabsSettings() {
  const { t } = useI18n();
  const order = useCell(settingsAtoms.mainTabOrder);
  const unlocked = useCell(settingsAtoms.gameTabUnlocked);
  const flags = {
    collection: useCell(settingsAtoms.collectionTabEnabled),
    anilist: useCell(settingsAtoms.anilistTabEnabled),
    stream: useCell(settingsAtoms.streamTabEnabled),
    manga: useCell(settingsAtoms.mangaTabEnabled),
    news: useCell(settingsAtoms.newsTabEnabled),
  };
  const rows = orderMainTabs(unlocked ? [...TAB_KEYS, { id: "game" as const, key: "app.game" as const }] : TAB_KEYS, order);
  const [dragged, setDragged] = useState<TabId | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const move = (from: string | number, to: string | number) => {
    const next = rows.map((row) => row.id);
    const start = next.indexOf(from as TabId);
    const end = next.indexOf(to as TabId);

    if (start === -1 || end === -1 || start === end) return;
    const [item] = next.splice(start, 1);

    if (!item) return;
    next.splice(end, 0, item);
    patchSettings({ mainTabOrder: next });
  };

  const active = rows.find((row) => row.id === dragged);
  const activeFlag = active && active.id in flags ? active.id as keyof typeof flags : null;

  return <DndContext sensors={sensors} onDragStart={({ active }) => setDragged(active.id as TabId)} onDragCancel={() => setDragged(null)} onDragEnd={({ active, over }) => { setDragged(null);

 if (over) move(active.id, over.id); }}>
    <ul className="flex w-fit flex-col gap-3 px-2 py-3 min-[560px]:ml-35">
      {rows.map((row) => {
        const flag = row.id in flags ? row.id as keyof typeof flags : null;

        return <MangaStatusRow key={row.id} id={row.id} dragLabel={t(row.key)} dragDisabled={false} editing={false} plain>
          <label className="windows95-text flex items-center gap-1.5 text-xs select-none">
            <Checkbox aria-label={t(row.key)} checked={flag ? flags[flag] : true} disabled={!flag} onChange={(value) => { if (flag) patchSettings({ [`${flag}TabEnabled`]: value }); }} />
            {t(row.key)}
          </label>
        </MangaStatusRow>;
      })}
    </ul>
    {typeof document !== "undefined" && createPortal(<DragOverlay dropAnimation={null} zIndex={10000}>{active && <div aria-hidden className="bg-primary pointer-events-none flex items-center gap-1 text-xs shadow-sm outline-1 outline-dotted outline-text/30 outline-offset-2"><GripVertical className="text-hint size-4" /><span className="windows95-text flex items-center gap-1.5"><Checkbox checked={activeFlag ? flags[activeFlag] : true} disabled={!activeFlag} onChange={() => {}} />{t(active.key)}</span></div>}</DragOverlay>, document.body)}
  </DndContext>;
}
