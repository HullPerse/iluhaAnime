import { useSettingsStore } from "@/store/settings.store";
import { Input } from "@/components/ui/input.component";
import { Checkbox } from "@/components/ui/checkbox.component";

export default function SettingsGeneral() {
  const { continueWatchingMax, toastDuration, autoCleanTempFiles, patch } =
    useSettingsStore();

  return (
    <div className="flex flex-col gap-3 p-4">
      <label className="flex items-center gap-2 windows95-text text-text">
        <span className="w-48">Максимум в "Продолжить просмотр"</span>
        <Input
          type="number"
          min={0}
          max={20}
          value={continueWatchingMax}
          onChange={(e) =>
            patch({ continueWatchingMax: Number(e.target.value) })
          }
          className="w-16"
        />
      </label>

      <label className="flex items-center gap-2 windows95-text text-text">
        <span className="w-48">Длительность уведомлений (мс)</span>
        <Input
          type="number"
          min={500}
          max={30000}
          step={100}
          value={toastDuration}
          onChange={(e) => patch({ toastDuration: Number(e.target.value) })}
          className="w-20"
        />
      </label>

        <label className="flex items-center gap-2 windows95-text text-text cursor-pointer select-none">
        <Checkbox
          checked={autoCleanTempFiles}
          onChange={(v) => patch({ autoCleanTempFiles: v })}
        />
        <span>Автоматически чистить временные файлы</span>
      </label>
    </div>
  );
}
