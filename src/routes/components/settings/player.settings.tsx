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
    audioExtensions,
    subtitleExtensions,
    showTrackFiles,
    preferredAudioLangs,
    preferredAudioPatterns,
    preferredSubLangs,
    preferredSubPatterns,
    preferForcedSubs,
    fallbackToFirstTrack,
    afterPlaybackAction,
    patch,
  } = useSettingsStore();
  const [extInput, setExtInput] = useState("");
  const [audioExtInput, setAudioExtInput] = useState("");
  const [subExtInput, setSubExtInput] = useState("");

  useEffect(() => {
    invoke("set_video_extensions", { extensions: videoExtensions }).catch(
      () => {},
    );
  }, [videoExtensions]);

  useEffect(() => {
    invoke("set_audio_extensions", { extensions: audioExtensions }).catch(
      () => {},
    );
  }, [audioExtensions]);

  useEffect(() => {
    invoke("set_subtitle_extensions", { extensions: subtitleExtensions }).catch(
      () => {},
    );
  }, [subtitleExtensions]);

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

      <hr className="windows95-header w-full" />

      <p className="windows95-text text-muted font-bold">Предпочтения дорожек</p>

      <label className="flex items-center gap-2 windows95-text text-text">
        <span className="w-48">Языки аудио</span>
        <Input
          value={preferredAudioLangs.join(", ")}
          onChange={(e) =>
            patch({
              preferredAudioLangs: e.target.value
                .split(",")
                .map((s) => s.trim().toLowerCase())
                .filter(Boolean),
            })
          }
          placeholder="jpn, eng"
          className="w-40"
        />
      </label>

      <label className="flex items-center gap-2 windows95-text text-text">
        <span className="w-48">Паттерны аудио</span>
        <Input
          value={preferredAudioPatterns.join(", ")}
          onChange={(e) =>
            patch({
              preferredAudioPatterns: e.target.value
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean),
            })
          }
          placeholder="FLAC, !Commentary"
          className="w-40"
        />
      </label>

      <label className="flex items-center gap-2 windows95-text text-text">
        <span className="w-48">Языки субтитров</span>
        <Input
          value={preferredSubLangs.join(", ")}
          onChange={(e) =>
            patch({
              preferredSubLangs: e.target.value
                .split(",")
                .map((s) => s.trim().toLowerCase())
                .filter(Boolean),
            })
          }
          placeholder="eng, rus"
          className="w-40"
        />
      </label>

      <label className="flex items-center gap-2 windows95-text text-text">
        <span className="w-48">Паттерны субтитров</span>
        <Input
          value={preferredSubPatterns.join(", ")}
          onChange={(e) =>
            patch({
              preferredSubPatterns: e.target.value
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean),
            })
          }
          placeholder="Full, Signs, !SDH"
          className="w-40"
        />
      </label>

      <label className="flex items-center gap-2 windows95-text text-text">
        <span className="w-48">Forced-субтитры</span>
        <input
          type="checkbox"
          checked={preferForcedSubs}
          onChange={(e) => patch({ preferForcedSubs: e.target.checked })}
        />
      </label>

      <label className="flex items-center gap-2 windows95-text text-text">
        <span className="w-48">Первую дорожку по умолчанию</span>
        <input
          type="checkbox"
          checked={fallbackToFirstTrack}
          onChange={(e) => patch({ fallbackToFirstTrack: e.target.checked })}
        />
      </label>

      <hr className="windows95-header w-full" />

      <p className="windows95-text text-muted font-bold">Воспроизведение</p>

      <label className="flex items-center gap-2 windows95-text text-text">
        <span className="w-48">После окончания</span>
        <Select
          className="w-40"
          value={afterPlaybackAction}
          onChange={(v) => patch({ afterPlaybackAction: v as "next" | "stop" | "repeat_one" })}
          options={[
            { value: "next", label: "Следующий файл" },
            { value: "stop", label: "Остановить" },
            { value: "repeat_one", label: "Повторить текущий" },
          ]}
        />
      </label>

      <hr className="windows95-header w-full" />

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
        Расширения аудио/субтитров
      </p>
      <div className="flex flex-wrap gap-1">
        {audioExtensions.map((ext) => (
          <span
            key={ext}
            className="windows95-border px-1 text-[10px] windows95-text cursor-pointer hover:bg-surface bg-white"
            onClick={() =>
              patch({
                audioExtensions: audioExtensions.filter((e) => e !== ext),
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
          value={audioExtInput}
          onChange={(e) => setAudioExtInput(e.target.value)}
          placeholder="mp3"
          className="w-20"
          onKeyDown={(e) => {
            if (e.key === "Enter" && audioExtInput.trim()) {
              const ext = audioExtInput.trim().toLowerCase().replace(/^\./, "");
              if (!audioExtensions.includes(ext)) {
                patch({ audioExtensions: [...audioExtensions, ext] });
              }
              setAudioExtInput("");
            }
          }}
        />
        <Button
          disabled={!audioExtInput.trim()}
          onClick={() => {
            const ext = audioExtInput.trim().toLowerCase().replace(/^\./, "");
            if (!audioExtensions.includes(ext)) {
              patch({ audioExtensions: [...audioExtensions, ext] });
            }
            setAudioExtInput("");
          }}
        >
          +
        </Button>
      </div>

      <hr className="windows95-header w-full" />

      <p className="windows95-text text-muted font-bold">
        Отображение файлов треков
      </p>
      <label className="flex items-center gap-2 windows95-text text-text">
        <span className="w-48">Показывать в папках/торрентах</span>
        <Select
          className="w-40"
          value={showTrackFiles}
          onChange={(v) => patch({ showTrackFiles: v as "hide" | "torrent" | "folders" })}
          options={[
            { value: "hide", label: "Скрыть" },
            { value: "torrent", label: "Только торрент" },
            { value: "folders", label: "Только папки" },
          ]}
        />
      </label>

      <hr className="windows95-header w-full" />

      <p className="windows95-text text-muted font-bold">
        Расширения субтитров
      </p>
      <div className="flex flex-wrap gap-1">
        {subtitleExtensions.map((ext) => (
          <span
            key={ext}
            className="windows95-border px-1 text-[10px] windows95-text cursor-pointer hover:bg-surface bg-white"
            onClick={() =>
              patch({
                subtitleExtensions: subtitleExtensions.filter((e) => e !== ext),
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
          value={subExtInput}
          onChange={(e) => setSubExtInput(e.target.value)}
          placeholder="srt"
          className="w-20"
          onKeyDown={(e) => {
            if (e.key === "Enter" && subExtInput.trim()) {
              const ext = subExtInput.trim().toLowerCase().replace(/^\./, "");
              if (!subtitleExtensions.includes(ext)) {
                patch({ subtitleExtensions: [...subtitleExtensions, ext] });
              }
              setSubExtInput("");
            }
          }}
        />
        <Button
          disabled={!subExtInput.trim()}
          onClick={() => {
            const ext = subExtInput.trim().toLowerCase().replace(/^\./, "");
            if (!subtitleExtensions.includes(ext)) {
              patch({ subtitleExtensions: [...subtitleExtensions, ext] });
            }
            setSubExtInput("");
          }}
        >
          +
        </Button>
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
