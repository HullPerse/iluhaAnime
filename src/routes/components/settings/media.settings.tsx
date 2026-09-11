import { useState } from "react";

import { Button } from "@/components/ui/button.component";
import { Input } from "@/components/ui/input.component";
import Select from "@/components/ui/select.component";
import { DEFAULT_SETTINGS } from "@/config/settings/defaults.config";
import { useI18n } from "@/lib/locale/i18n.utils";
import { useSettingsStore } from "@/store/settings.store";

function parseExtensions(raw: string): string[] | null {
  const list = [
    ...new Set(
      raw
        .split(/[\s,;]+/)
        .map((part) => part.trim().toLowerCase().replace(/^\.+/, ""))
        .filter(Boolean)
    ),
  ];
  return list.length > 0 ? list : null;
}

function ExtensionRow({
  label,
  value,
  onChange,
  onCommit,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onCommit: () => void;
}) {
  return (
    <label className="windows95-text text-text flex items-center gap-2 text-xs select-none">
      <span className="w-36 shrink-0 font-bold">{label}</span>
      <Input
        className="h-6 flex-1"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onCommit}
      />
    </label>
  );
}

export default function SettingsMedia() {
  const { videoExtensions, audioExtensions, subtitleExtensions, showTrackFiles, patch } =
    useSettingsStore();
  const { t } = useI18n();
  const [video, setVideo] = useState(() => videoExtensions.join(", "));
  const [audio, setAudio] = useState(() => audioExtensions.join(", "));
  const [subtitles, setSubtitles] = useState(() => subtitleExtensions.join(", "));
  const [emptyError, setEmptyError] = useState(false);

  const commit = (raw: string, fallback: string[], apply: (list: string[]) => void) => {
    const parsed = parseExtensions(raw);
    if (!parsed) {
      setEmptyError(true);
      return fallback.join(", ");
    }
    setEmptyError(false);
    apply(parsed);
    return parsed.join(", ");
  };

  return (
    <section className="ui-panel">
      <div className="ui-titlebar">
        <span className="font-bold text-white">{t("settings.media.title")}</span>
      </div>
      <div className="flex flex-col gap-1 p-2">
        <ExtensionRow
          label={t("settings.media.video")}
          value={video}
          onChange={setVideo}
          onCommit={() =>
            setVideo(commit(video, videoExtensions, (list) => patch({ videoExtensions: list })))
          }
        />
        <ExtensionRow
          label={t("settings.media.audio")}
          value={audio}
          onChange={setAudio}
          onCommit={() =>
            setAudio(commit(audio, audioExtensions, (list) => patch({ audioExtensions: list })))
          }
        />
        <ExtensionRow
          label={t("settings.media.subtitles")}
          value={subtitles}
          onChange={setSubtitles}
          onCommit={() =>
            setSubtitles(
              commit(subtitles, subtitleExtensions, (list) => patch({ subtitleExtensions: list }))
            )
          }
        />
        {emptyError && (
          <span className="text-destructive text-xs">{t("settings.media.empty")}</span>
        )}
        <label className="windows95-text text-text flex items-center gap-2 text-xs select-none">
          <span className="w-36 shrink-0 font-bold">{t("settings.media.tracks")}</span>
          <Select
            value={showTrackFiles}
            onChange={(value) => patch({ showTrackFiles: value as typeof showTrackFiles })}
            options={[
              { value: "hide", label: t("settings.media.tracks.hide") },
              { value: "folders", label: t("settings.media.tracks.folders") },
              { value: "torrent", label: t("settings.media.tracks.torrent") },
            ]}
            className="h-6 flex-1"
          />
        </label>
        <div>
          <Button
            className="text-xs"
            onClick={() =>
              patch({
                videoExtensions: DEFAULT_SETTINGS.videoExtensions,
                audioExtensions: DEFAULT_SETTINGS.audioExtensions,
                subtitleExtensions: DEFAULT_SETTINGS.subtitleExtensions,
              })
            }
          >
            {t("settings.media.reset")}
          </Button>
        </div>
      </div>
    </section>
  );
}
