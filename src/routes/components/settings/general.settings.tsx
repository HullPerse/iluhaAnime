import { useSettingsStore } from "@/store/settings.store";
import { Input } from "@/components/ui/input.component";
import { Button } from "@/components/ui/button.component";
import { ToolDownloader } from "@/components/shared/downloader.component";

export default function SettingsGeneral() {
  const { toastDuration, patch } = useSettingsStore();

  const handleClearAll = async () => {
    const ok = window.confirm(
      "Это удалит:\n" +
        "• историю поиска\n" +
        "• все сохранённые данные\n\n" +
        "Продолжить?",
    );
    if (!ok) return;

    localStorage.removeItem("settings");
    localStorage.removeItem("searchState");
    localStorage.removeItem("themeState");
    localStorage.removeItem("lastSaveDir");

    window.location.reload();
  };

  return (
    <div className="flex flex-col gap-3 p-4">
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

      <hr className="windows95-border my-2" />

      <div className="flex flex-col gap-1">
        <span className="windows95-text text-[10px] font-bold">
          AI Инструменты
        </span>
        <span className="windows95-text text-[9px]">
          Скачанные инструменты доступны в модальных окнах апскейла.
        </span>
        <div className="flex flex-col gap-0.5 mt-0.5">
          <div className="flex items-center gap-2">
            <span className="windows95-text text-[10px] w-28">Real-ESRGAN</span>
            <ToolDownloader toolId="realesrgan" />
          </div>
          <div className="flex items-center gap-2">
            <span className="windows95-text text-[10px] w-28">waifu2x</span>
            <ToolDownloader toolId="waifu2x" />
          </div>
        </div>
      </div>

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
          onClick={handleClearAll}
        >
          Удалить все данные
        </Button>
      </div>
    </div>
  );
}
