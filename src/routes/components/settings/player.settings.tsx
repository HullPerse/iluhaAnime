import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useSettingsStore } from "@/store/settings.store";
import { Input } from "@/components/ui/input.component";
import { Button } from "@/components/ui/button.component";
import { ColorPickerTrigger } from "@/components/ui/color.component";
import Select from "@/components/ui/select.component";

export default function SettingsPlayer() {
  const {
    autoHideDelay,
    subtitleFontSize,
    subtitleFontFamily,
    subtitleColor,
    subtitleBgOpacity,
    subtitleBgColor,
    videoExtensions,
    patch,
  } = useSettingsStore();
  const [extInput, setExtInput] = useState("");

  useEffect(() => {
    invoke("set_video_extensions", { extensions: videoExtensions }).catch(
      () => {},
    );
  }, [videoExtensions]);

  return (
    <div className="flex flex-col gap-3 p-4">
      <label className="flex items-center gap-2 windows95-text text-text">
        <span className="w-48">Авто-скрытие элементов (мс)</span>
        <Input
          type="number"
          min={0}
          max={30000}
          step={100}
          value={autoHideDelay}
          onChange={(e) => patch({ autoHideDelay: Number(e.target.value) })}
          className="w-20"
        />
      </label>

      <hr className=".windows95-header w-full" />

      <p className="windows95-text text-muted font-bold">Субтитры</p>

      <label className="flex items-center gap-2 windows95-text text-text">
        <span className="w-48">Размер шрифта</span>
        <Input
          type="number"
          min={8}
          max={72}
          value={subtitleFontSize}
          onChange={(e) => patch({ subtitleFontSize: Number(e.target.value) })}
          className="w-16"
        />
      </label>

      <label className="flex items-center gap-2 windows95-text text-text">
        <span className="w-48">Шрифт</span>
        <Select
          className="w-40"
          value={subtitleFontFamily}
          onChange={(v) => patch({ subtitleFontFamily: v })}
          options={[
            { value: "Arial", label: "Arial" },
            { value: "Tahoma", label: "Tahoma" },
            { value: "Verdana", label: "Verdana" },
            { value: "'Courier New'", label: "Courier New" },
            { value: "Georgia", label: "Georgia" },
            { value: "Impact", label: "Impact" },
          ]}
        />
      </label>

      <label className="flex items-center gap-2 windows95-text text-text">
        <span className="w-48">Цвет текста</span>
        <ColorPickerTrigger
          value={subtitleColor}
          onChange={(v) => patch({ subtitleColor: v })}
        />
      </label>

      <label className="flex items-center gap-2 windows95-text text-text">
        <span className="w-48">Цвет фона</span>
        <ColorPickerTrigger
          value={subtitleBgColor}
          onChange={(v) => patch({ subtitleBgColor: v })}
        />
      </label>

      <label className="flex items-center gap-2 windows95-text text-text">
        <span className="w-48">Непрозрачность фона</span>
        <Input
          type="number"
          min={0}
          max={100}
          value={subtitleBgOpacity}
          onChange={(e) => patch({ subtitleBgOpacity: Number(e.target.value) })}
          className="w-16"
        />
      </label>

      {/* Subtitle preview */}
      <p className="windows95-text text-muted font-bold">Предпросмотр</p>
      <div
        className="windows95-border flex items-center justify-center"
        style={{
          width: 350,
          height: 100,
          background: "var(--color-background)",
        }}
      >
        <span
          style={{
            fontSize: subtitleFontSize,
            fontFamily: subtitleFontFamily,
            color: subtitleColor,
            backgroundColor:
              subtitleBgOpacity > 0
                ? `${subtitleBgColor}${Math.round(
                    (subtitleBgOpacity / 100) * 255,
                  )
                    .toString(16)
                    .padStart(2, "0")}`
                : undefined,
            padding: "2px 4px",
          }}
          className="windows95-text"
        >
          Привет, world! Субтитры выглядят так 123
        </span>
      </div>

      <hr className="windows95-header w-full" />

      <p className="windows95-text text-muted font-bold">
        Расширения видеофайлов
      </p>
      <div className="flex flex-wrap gap-1">
        {videoExtensions.map((ext) => (
          <span
            key={ext}
            className="windows95-border px-1 text-[10px] windows95-text cursor-pointer hover:bg-surface bg-white"
            onClick={() =>
              patch({
                videoExtensions: videoExtensions.filter((e) => e !== ext),
              })
            }
            title="Удалить"
          >
            .{ext} ✕
          </span>
        ))}
      </div>
      <div className="flex items-center gap-1">
        <Input
          value={extInput}
          onChange={(e) => setExtInput(e.target.value)}
          placeholder="mp4"
          className="w-20"
          onKeyDown={(e) => {
            if (e.key === "Enter" && extInput.trim()) {
              const ext = extInput.trim().toLowerCase().replace(/^\./, "");
              if (!videoExtensions.includes(ext)) {
                patch({ videoExtensions: [...videoExtensions, ext] });
              }
              setExtInput("");
            }
          }}
        />
        <Button
          disabled={!extInput.trim()}
          onClick={() => {
            const ext = extInput.trim().toLowerCase().replace(/^\./, "");
            if (!videoExtensions.includes(ext)) {
              patch({ videoExtensions: [...videoExtensions, ext] });
            }
            setExtInput("");
          }}
        >
          +
        </Button>
      </div>
    </div>
  );
}
