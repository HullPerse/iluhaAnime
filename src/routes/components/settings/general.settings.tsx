import { useState } from "react";
import { useSettingsStore } from "@/store/settings.store";
import { Button } from "@/components/ui/button.component";
import { Checkbox } from "@/components/ui/checkbox.component";
import Select from "@/components/ui/select.component";
import { ConfirmDialog } from "@/components/shared/confirm.component";

const FRANCHISE_OPTIONS = [
  { value: "all", label: "Все связи" },
  { value: "main", label: "Только сиквелы/приквелы" },
] as const;

export default function SettingsGeneral() {
  const { parseTitles, franchiseRelationScope, patch } = useSettingsStore();
  const [pendingClear, setPendingClear] = useState(false);

  return (
    <div className="flex flex-col gap-3 p-4">

      <label className="flex items-center gap-2 windows95-text text-text cursor-pointer select-none">
        <Checkbox
          checked={parseTitles}
          onChange={(v) => {
            patch({ parseTitles: v });
          }}
        />
        <span>
          Извлекать названия аниме {`([Erai-Raws]Maruto.1080p -> Naruto)`}
        </span>
      </label>

      <label className="flex items-center gap-2 windows95-text text-text">
        <span className="w-48">Франшиза</span>
        <Select
          value={franchiseRelationScope}
          onChange={(v) => patch({ franchiseRelationScope: v as "all" | "main" })}
          options={[...FRANCHISE_OPTIONS]}
          className="w-44"
        />
      </label>

      <hr className="windows95-header w-full" />

      <div className="flex flex-col gap-1">
        <span className="windows95-text text-[10px] font-bold">
          Сброс данных
        </span>
        <span className="windows95-text text-[9px]">
          Удаляет кэш, историю, прогресс просмотра, настройки и перезагружает
          приложение.
        </span>
        <Button
          variant="destructive"
          className="w-fit mt-1"
          onClick={() => setPendingClear(true)}
        >
          Удалить все данные
        </Button>
      </div>

      {pendingClear && (
        <ConfirmDialog
          open
          title="Сброс данных"
          message={"Это удалит:\n• историю поиска\n• все сохранённые данные\n\nПродолжить?"}
          confirmLabel="Удалить"
          variant="destructive"
          onConfirm={() => {
            localStorage.removeItem("settings");
            localStorage.removeItem("searchState");
            localStorage.removeItem("themeState");
            localStorage.removeItem("lastSaveDir");
            localStorage.removeItem("cache");
            window.location.reload();
          }}
          onCancel={() => setPendingClear(false)}
          onClose={() => setPendingClear(false)}
        />
      )}
    </div>
  );
}
