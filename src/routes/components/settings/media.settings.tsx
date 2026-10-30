import { useState } from "react";

import { Button } from "@/components/ui/button.component";
import Select from "@/components/ui/select.component";
import { DEFAULT_SETTINGS } from "@/config/settings/settingsDefaults.config";
import { STREAM_QUALITIES, streamQualityLabel } from "@/config/player/quality.config";
import { useI18n } from "@/hooks/i18n.hook";
import { parseExtensions } from "@/lib/ui/settingsMedia.utils";
import { useCell } from "@/lib/core/signal.hook";
import { patchSettings, settingsAtoms } from "@/store/settings.store";

import { ExtensionRow } from "@/routes/components/settings/extensionRow.settings";

export default function SettingsMedia() {
  const videoExtensions = useCell(settingsAtoms.videoExtensions);
  const audioExtensions = useCell(settingsAtoms.audioExtensions);
  const subtitleExtensions = useCell(settingsAtoms.subtitleExtensions);
  const showTrackFiles = useCell(settingsAtoms.showTrackFiles);
  const streamDefaultQuality = useCell(settingsAtoms.streamDefaultQuality);
  const watcherDelay = useCell(settingsAtoms.watcherDelay);
  const scanThreads = useCell(settingsAtoms.scanThreads);
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
    <section className="ui-panel" data-find-section="general.media">
      <div className="ui-titlebar">
        <span className="text-title-text font-bold">{t("settings.media.title")}</span>
      </div>
      <div className="flex flex-col gap-1 p-2">
        <ExtensionRow
          label={t("settings.media.video")}
          value={video}
          onChange={setVideo}
          onCommit={() =>
            setVideo(
              commit(video, videoExtensions, (list) => patchSettings({ videoExtensions: list }))
            )
          }
        />
        <ExtensionRow
          label={t("settings.media.audio")}
          value={audio}
          onChange={setAudio}
          onCommit={() =>
            setAudio(
              commit(audio, audioExtensions, (list) => patchSettings({ audioExtensions: list }))
            )
          }
        />
        <ExtensionRow
          label={t("settings.media.subtitles")}
          value={subtitles}
          onChange={setSubtitles}
          onCommit={() =>
            setSubtitles(
              commit(subtitles, subtitleExtensions, (list) =>
                patchSettings({ subtitleExtensions: list })
              )
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
            onChange={(value) => patchSettings({ showTrackFiles: value as typeof showTrackFiles })}
            options={[
              { value: "hide", label: t("settings.media.tracks.hide") },
              { value: "folders", label: t("settings.media.tracks.folders") },
              { value: "torrent", label: t("settings.media.tracks.torrent") },
            ]}
            className="h-6 flex-1"
          />
        </label>
        <div className="windows95-text text-text flex items-center gap-2 text-xs select-none">
          <span className="w-36 shrink-0 font-bold">{t("settings.media.streamQuality")}</span>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <Select
              value={streamDefaultQuality}
              onChange={(value) =>
                patchSettings({ streamDefaultQuality: value as typeof streamDefaultQuality })
              }
              options={STREAM_QUALITIES.map((quality) => ({
                value: quality,
                label: streamQualityLabel(quality),
              }))}
              className="h-6"
              label={t("settings.media.streamQuality")}
            />
            <span className="text-hint text-[12px]">{t("settings.media.streamQuality.hint")}</span>
          </div>
        </div>
        <label className="windows95-text text-text flex items-center gap-2 text-xs select-none">
          <span className="w-36 shrink-0 font-bold">{t("settings.media.watcher")}</span>
          <Select
            value={watcherDelay}
            onChange={(value) => patchSettings({ watcherDelay: value as typeof watcherDelay })}
            options={[
              { value: "fast", label: t("settings.media.watcher.fast") },
              { value: "calm", label: t("settings.media.watcher.calm") },
            ]}
            className="h-6 flex-1"
          />
        </label>
        <label className="windows95-text text-text flex items-center gap-2 text-xs select-none">
          <span className="w-36 shrink-0 font-bold">{t("settings.media.scanThreads")}</span>
          <Select
            value={String(scanThreads)}
            onChange={(value) => patchSettings({ scanThreads: Number(value) })}
            options={[
              { value: "0", label: t("settings.media.scanThreads.auto") },
              { value: "2", label: t("settings.media.scanThreads.two") },
              { value: "4", label: t("settings.media.scanThreads.four") },
              { value: "6", label: t("settings.media.scanThreads.six") },
              { value: "8", label: t("settings.media.scanThreads.eight") },
            ]}
            className="h-6 flex-1"
          />
        </label>
        <div>
          <Button
            className="text-xs"
            onClick={() =>
              patchSettings({
                videoExtensions: DEFAULT_SETTINGS.videoExtensions,
                audioExtensions: DEFAULT_SETTINGS.audioExtensions,
                subtitleExtensions: DEFAULT_SETTINGS.subtitleExtensions,
                streamDefaultQuality: DEFAULT_SETTINGS.streamDefaultQuality,
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
