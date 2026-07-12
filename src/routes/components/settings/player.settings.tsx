import { useCallback, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { useSettingsStore } from "@/store/settings.store";
import { Button } from "@/components/ui/button.component";
import Select from "@/components/ui/select.component";
import { Checkbox } from "@/components/ui/checkbox.component";

export default function SettingsPlayer() {
  const { mediaPlayer, customPlayers, showTorrentsInPlayer, patch } = useSettingsStore();
  const [customPaths, setCustomPaths] = useState<string[]>(customPlayers);

  const playerOptions = [
    { value: "default", label: "Системный плеер по умолчанию" },
    ...customPaths.map((p) => ({
      value: p,
      label: p.split(/[/\\]/).pop()?.replace(/\.exe$/i, "") || p,
    })),
  ];

  const handleAddPlayer = useCallback(async () => {
    const file = await open({
      multiple: false,
      filters: [
        { name: "Исполняемые файлы", extensions: ["exe", "bat", "cmd"] },
        { name: "Все файлы", extensions: ["*"] },
      ],
    });

    if (file && !customPaths.includes(file)) {
      const newPaths = [...customPaths, file];
      setCustomPaths(newPaths);
      patch({ customPlayers: newPaths });
    }
  }, [customPaths, patch]);

  const handleRemovePlayer = useCallback(
    (path: string) => {
      const newPaths = customPaths.filter((p) => p !== path);
      setCustomPaths(newPaths);
      patch({ customPlayers: newPaths });
      if (mediaPlayer === path) {
        patch({ mediaPlayer: "default" });
      }
    },
    [customPaths, mediaPlayer, patch],
  );

  return (
    <div className="flex flex-col gap-3 p-4">
      <label className="flex items-center gap-2 windows95-text text-text">
        <span className="w-48">Медиа плеер</span>
        <Select
          className="w-60"
          value={mediaPlayer}
          onChange={(v) => patch({ mediaPlayer: v })}
          options={playerOptions}
        />
      </label>

      <hr className="windows95-header w-full" />

      <label className="flex items-center gap-2 windows95-text text-text cursor-pointer select-none">
        <Checkbox
          checked={showTorrentsInPlayer}
          onChange={(v) => patch({ showTorrentsInPlayer: v })}
        />
        <span>Показывать торренты в плеере</span>
      </label>

      <hr className="windows95-header w-full" />

      <p className="windows95-text text-muted font-bold">
        Пользовательские плееры
      </p>

      {customPaths.length === 0 && (
        <span className="windows95-text text-[10px] text-muted">
          Нет добавленных плееров. Нажмите "Добавить", чтобы указать путь к
          исполняемому файлу плеера.
        </span>
      )}

      {customPaths.map((p) => (
        <div
          key={p}
          className="flex items-center gap-1 windows95-border bg-white px-1 py-0.5"
        >
          <span className="flex-1 text-[10px] windows95-text truncate" title={p}>
            {p}
          </span>
          <Button
            size="icon"
            className="h-4 w-4"
            onClick={() => handleRemovePlayer(p)}
            title="Удалить"
          >
            ✕
          </Button>
        </div>
      ))}

      <Button className="w-fit" onClick={handleAddPlayer}>
        + Добавить плеер
      </Button>
    </div>
  );
}
