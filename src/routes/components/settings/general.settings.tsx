import { invoke } from "@tauri-apps/api/core";
import { useSettingsStore } from "@/store/settings.store";
import { Input } from "@/components/ui/input.component";
import { Checkbox } from "@/components/ui/checkbox.component";
import { Button } from "@/components/ui/button.component";
import { ToolDownloader } from "@/components/shared/tool-downloader.component";

export default function SettingsGeneral() {
  const {
    continueWatchingMax,
    toastDuration,
    autoCleanTempFiles,
    translateService,
    googleTranslateApiKey,
    deeplApiKey,
    patch,
  } = useSettingsStore();

  const handleClearAll = async () => {
    const ok = window.confirm(
      "Это удалит:\n" +
        "• кэш аудио и субтитров\n" +
        "• кэш превью\n" +
        "• историю поиска\n" +
        "• прогресс просмотра\n" +
        "• выбранные дорожки\n" +
        "• настройки плеера\n" +
        "• все сохранённые данные\n\n" +
        "Продолжить?",
    );
    if (!ok) return;

    await invoke("clear_all_caches").catch(() => {});

    localStorage.removeItem("settings");
    localStorage.removeItem("mediaState");
    localStorage.removeItem("playerState");
    localStorage.removeItem("searchState");
    localStorage.removeItem("themeState");
    localStorage.removeItem("lastSaveDir");

    window.location.reload();
  };

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

      <hr className="windows95-border my-2" />

      <div className="flex flex-col gap-1">
        <span className="windows95-text text-[10px] font-bold">
          AI Инструменты
        </span>
        <span className="windows95-text text-[9px]">
          Скачанные инструменты доступны в модальных окнах апскейла и субтитров.
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
          <div className="flex items-center gap-2">
            <span className="windows95-text text-[10px] w-28">RIFE</span>
            <ToolDownloader toolId="rife" />
          </div>
          <div className="flex items-center gap-2">
            <span className="windows95-text text-[10px] w-28">Whisper CLI</span>
            <ToolDownloader toolId="whisper-cli" />
          </div>
          <div className="flex items-center gap-2">
            <span className="windows95-text text-[10px] w-28">
              Whisper Tiny
            </span>
            <ToolDownloader toolId="whisper-tiny" />
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <span className="windows95-text text-[10px] font-bold">
          Перевод субтитров
        </span>
        <span className="windows95-text text-[9px]">
          Сервис для перевода AI субтитров с английского на русский.
        </span>
        <div className="flex items-center gap-2">
          <span className="windows95-text text-[10px] w-28">Сервис</span>
          <select
            className="windows95-border bg-white text-[10px] px-1 py-0.5"
            value={translateService}
            onChange={(e) => patch({ translateService: e.target.value as any })}
          >
            <option value="libre">LibreTranslate (бесплатно)</option>
            <option value="google">Google Translate API</option>
            <option value="deepl">DeepL API</option>
          </select>
        </div>
        {translateService !== "libre" && (
          <div className="flex items-center gap-2">
            <span className="windows95-text text-[10px] w-28">API ключ ({translateService === "google" ? "Google" : "DeepL"})</span>
            <Input
              className="flex-1 text-[10px]"
              value={translateService === "google" ? googleTranslateApiKey : deeplApiKey}
              onChange={(e) =>
                patch(
                  translateService === "google"
                    ? { googleTranslateApiKey: e.target.value }
                    : { deeplApiKey: e.target.value },
                )
              }
            />
          </div>
        )}
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
