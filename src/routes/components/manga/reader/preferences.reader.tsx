import { useCell } from "@hullperse/hp_utils/react";
import { X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button.component";
import { Checkbox } from "@/components/ui/checkbox.component";
import Slider from "@/components/ui/range.component";
import {
  directionIcons,
  displayIcons,
  readerDirections,
  readerDisplays,
  readerTurns,
  turnIcons,
} from "@/config/manga/reader.config";
import { useI18n } from "@/hooks/i18n.hook";
import { ReaderFrameControl } from "@/routes/components/manga/reader/appearance.reader";
import { patchSettings, settingsAtoms } from "@/store/settings.store";
import { ReaderBackgroundSettings } from "@/routes/components/manga/reader/backgroundSettings.reader";

export function ReaderPreferences({
  brightness,
  autoMark,
  onDisplayChange,
  onClose,
}: {
  brightness: number;
  autoMark: boolean;
  onDisplayChange: (display: (typeof readerDisplays)[number]) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const display = useCell(settingsAtoms.mangaReaderDisplay);
  const direction = useCell(settingsAtoms.mangaReaderDirection);
  const turn = useCell(settingsAtoms.mangaReaderTurn);
  const preload = useCell(settingsAtoms.mangaPreload);
  const splitWide = useCell(settingsAtoms.mangaSplitWide);
  const zoom = useCell(settingsAtoms.mangaReaderZoom);
  const containerWidth = useCell(settingsAtoms.mangaReaderWidth);
  const gap = useCell(settingsAtoms.mangaReaderGap);
  const animated = useCell(settingsAtoms.mangaReaderAnimated);
  const [section, setSection] = useState<"reading" | "page" | "background">("reading");

  return (
    <aside
      aria-label={t("manga.reader.settings")}
      data-reader-ui
      className="ui-panel text-text absolute inset-y-0 right-0 z-30 flex w-80 max-w-[calc(100%-1rem)] flex-col overflow-hidden text-xs"
    >
      <header className="ui-titlebar shrink-0 justify-between">
        <h2>{t("manga.reader.settings")}</h2>
        <Button size="icon" className="size-5" onClick={onClose} aria-label={t("common.close")}>
          <X className="size-3" aria-hidden />
        </Button>
      </header>
      <div className="ui-toolbar shrink-0" role="group" aria-label={t("manga.reader.settings")}>
        {(["reading", "page", "background"] as const).map((value) => (
          <Button
            key={value}
            variant={section === value ? "outline" : "default"}
            aria-pressed={section === value}
            className="flex-1"
            onClick={() => setSection(value)}
          >
            {t(`manga.reader.settings.${value}`)}
          </Button>
        ))}
      </div>
      <div className="min-h-0 overflow-y-auto p-2">
        {section === "reading" && (
          <div className="grid gap-3">
            <fieldset className="grid gap-1.5">
              <legend className="pb-1 font-bold">{t("manga.reader.display")}</legend>
              {readerDisplays.map((value) => {
                const Icon = displayIcons[value];

                return (
                  <Button
                    key={value}
                    variant={display === value ? "outline" : "default"}
                    aria-pressed={display === value}
                    className="justify-start gap-1.5 whitespace-normal"
                    onClick={() => {
                      if (display !== value) onDisplayChange(value);
                      patchSettings({ mangaReaderDisplay: value });
                    }}
                  >
                    <Icon aria-hidden className="size-3.5 shrink-0" />
                    {t(`manga.reader.display.${value}`)}
                  </Button>
                );
              })}
            </fieldset>
            <fieldset className="grid gap-1.5">
              <legend className="pb-1 font-bold">{t("manga.reader.direction")}</legend>
              {readerDirections.map((value) => {
                const Icon = directionIcons[value];

                return (
                  <Button
                    key={value}
                    variant={direction === value ? "outline" : "default"}
                    aria-pressed={direction === value}
                    disabled={display !== "paged"}
                    className="justify-start gap-1.5 whitespace-normal"
                    onClick={() => patchSettings({ mangaReaderDirection: value })}
                  >
                    <Icon aria-hidden className="size-3.5 shrink-0" />
                    {t(`manga.reader.direction.${value}`)}
                  </Button>
                );
              })}
            </fieldset>
            <fieldset className="grid gap-1.5">
              <legend className="pb-1 font-bold">{t("manga.reader.turn")}</legend>
              {readerTurns.map((value) => {
                const Icon = turnIcons[value];

                return (
                  <Button
                    key={value}
                    variant={turn === value ? "outline" : "default"}
                    aria-pressed={turn === value}
                    disabled={display !== "paged"}
                    className="justify-start gap-1.5 whitespace-normal"
                    onClick={() => patchSettings({ mangaReaderTurn: value })}
                  >
                    <Icon aria-hidden className="size-3.5 shrink-0" />
                    {t(`manga.reader.turn.${value}`)}
                  </Button>
                );
              })}
            </fieldset>
            <Slider
              label={t("manga.reader.preload")}
              min={0}
              max={6}
              step={1}
              value={preload}
              onChange={(mangaPreload) => patchSettings({ mangaPreload })}
            />
            <label className="flex items-center gap-2">
              <Checkbox
                checked={autoMark}
                onChange={(mangaAutoMarkRead) => patchSettings({ mangaAutoMarkRead })}
              />
              {t("manga.reader.autoMark")}
            </label>
          </div>
        )}
        {section === "page" && (
          <div className="grid gap-3">
            <ReaderFrameControl />
            <Slider
              label={t("manga.reader.zoom")}
              min={50}
              max={200}
              step={5}
              suffix="%"
              value={zoom}
              onChange={(mangaReaderZoom) => patchSettings({ mangaReaderZoom })}
            />
            <Slider
              label={t("manga.reader.containerWidth")}
              min={40}
              max={100}
              step={5}
              suffix="%"
              value={containerWidth}
              onChange={(mangaReaderWidth) => patchSettings({ mangaReaderWidth })}
            />
            <Slider
              label={t("manga.reader.gap")}
              min={0}
              max={64}
              step={4}
              suffix="px"
              value={gap}
              onChange={(mangaReaderGap) => patchSettings({ mangaReaderGap })}
            />
            <Slider
              label={t("manga.reader.brightness")}
              min={20}
              max={150}
              step={1}
              suffix="%"
              value={brightness}
              onChange={(mangaBrightness) => patchSettings({ mangaBrightness })}
            />
            <label className="flex items-center gap-2">
              <Checkbox
                checked={animated}
                onChange={(mangaReaderAnimated) => patchSettings({ mangaReaderAnimated })}
              />
              {t("manga.reader.animation")}
            </label>
            <label className="flex items-center gap-2">
              <Checkbox
                checked={splitWide}
                onChange={(mangaSplitWide) => patchSettings({ mangaSplitWide })}
              />
              {t("manga.reader.splitWide")}
            </label>
          </div>
        )}
        {section === "background" && <ReaderBackgroundSettings />}
      </div>
    </aside>
  );
}
