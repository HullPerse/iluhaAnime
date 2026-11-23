import { useCell } from "@hullperse/hp_utils/react";
import { Button } from "@/components/ui/button.component";
import { Checkbox } from "@/components/ui/checkbox.component";
import Select from "@/components/ui/select.component";
import Slider from "@/components/ui/range.component";
import { useI18n } from "@/hooks/i18n.hook";
import { useKeybindChord } from "@/hooks/keybindTitle.hook";
import { patchSettings, settingsAtoms } from "@/store/settings.store";
import type { SettingsStore } from "@/types/ui/settings";

export function ReaderToolsSettings({
  autoRunning,
  onAutoToggle,
}: {
  autoRunning: boolean;
  onAutoToggle: () => void;
}) {
  const { t } = useI18n();
  const display = useCell(settingsAtoms.mangaReaderDisplay);
  const strip = display === "strip";
  const size = useCell(settingsAtoms.mangaLoupeSize);
  const zoom = useCell(settingsAtoms.mangaLoupeZoom);
  const speed = useCell(settingsAtoms.mangaAutoSpeed);
  const interval = useCell(settingsAtoms.mangaAutoInterval);
  const pause = useCell(settingsAtoms.mangaAutoPause);
  const next = useCell(settingsAtoms.mangaAutoNext);
  const hold = useCell(settingsAtoms.mangaAutoHold);
  const corner = useCell(settingsAtoms.mangaAutoCorner);
  const chord = useKeybindChord("manga-reader.auto");
  const cornerOptions: { value: SettingsStore["mangaAutoCorner"]; label: string }[] = [
    { value: "tr", label: t("manga.reader.autoCorner.tr") },
    { value: "br", label: t("manga.reader.autoCorner.br") },
    { value: "bl", label: t("manga.reader.autoCorner.bl") },
    { value: "tl", label: t("manga.reader.autoCorner.tl") },
    { value: "off", label: t("manga.reader.autoCorner.off") },
  ];

  return (
    <div className="grid gap-3">
      <fieldset className="grid gap-1.5">
        <legend className="pb-1 font-bold">{t("manga.reader.loupe")}</legend>
        <Slider
          label={t("manga.reader.loupeSize")}
          min={120}
          max={480}
          step={20}
          suffix=" px"
          value={size}
          onChange={(mangaLoupeSize) => patchSettings({ mangaLoupeSize })}
        />
        <Slider
          label={t("manga.reader.loupeZoom")}
          min={1.5}
          max={5}
          step={0.5}
          suffix="×"
          value={zoom}
          onChange={(mangaLoupeZoom) => patchSettings({ mangaLoupeZoom })}
        />
      </fieldset>
      <fieldset className="grid gap-1.5">
        <legend className="pb-1 font-bold">{t("manga.reader.auto")}</legend>
        <Button
          data-reader-auto
          className="w-full"
          variant={autoRunning ? "outline" : "default"}
          aria-pressed={autoRunning}
          onClick={onAutoToggle}
        >
          {t(autoRunning ? "manga.reader.autoStop" : "manga.reader.autoStart")}
        </Button>
        <Slider
          label={t("manga.reader.autoSpeed")}
          min={0.5}
          max={10}
          step={0.5}
          value={speed}
          onChange={(mangaAutoSpeed) => patchSettings({ mangaAutoSpeed })}
        />
        {!strip && (
          <Slider
            label={t("manga.reader.autoInterval")}
            min={2}
            max={60}
            step={1}
            suffix=" с"
            value={interval}
            onChange={(mangaAutoInterval) => patchSettings({ mangaAutoInterval })}
          />
        )}
        <Slider
          label={t("manga.reader.autoPause")}
          min={1}
          max={15}
          step={1}
          suffix=" с"
          value={pause}
          onChange={(mangaAutoPause) => patchSettings({ mangaAutoPause })}
        />
        <label className="flex items-center gap-2">
          <Checkbox
            checked={next}
            onChange={(mangaAutoNext) => patchSettings({ mangaAutoNext })}
            aria-label={t("manga.reader.autoNext")}
          />
          {t("manga.reader.autoNext")}
        </label>
        {strip && (
          <label className="flex items-center gap-2">
            <Checkbox
              checked={hold}
              onChange={(mangaAutoHold) => patchSettings({ mangaAutoHold })}
              aria-label={t("manga.reader.autoHold")}
            />
            {t("manga.reader.autoHold")}
          </label>
        )}
        <div className="grid gap-1">
          <span>{t("manga.reader.autoCorner")}</span>
          <Select<SettingsStore["mangaAutoCorner"]>
            value={corner}
            onChange={(mangaAutoCorner) => patchSettings({ mangaAutoCorner })}
            options={cornerOptions}
            label={t("manga.reader.autoCorner")}
          />
        </div>
        <span className="text-hint text-xs">
          {chord
            ? t("manga.reader.autoKeyHint", { chord })
            : t("manga.reader.autoKeyUnbound")}
        </span>
      </fieldset>
    </div>
  );
}
