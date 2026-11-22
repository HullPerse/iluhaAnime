import { useCell } from "@hullperse/hp_utils/react";
import { useContext } from "react";
import { Button } from "@/components/ui/button.component";
import { ColorPickerTrigger } from "@/components/ui/color/trigger.color";
import { SelectPortalContainerContext } from "@/components/ui/select.component";
import { readerBackgrounds, readerPalette } from "@/config/manga/reader.config";
import { useI18n } from "@/hooks/i18n.hook";
import { patchSettings, settingsAtoms } from "@/store/settings.store";

export function ReaderBackgroundSettings() {
  const { t } = useI18n();
  const background = useCell(settingsAtoms.mangaReaderBackground);
  const custom = useCell(settingsAtoms.mangaReaderBackgroundCustom);
  const portal = useContext(SelectPortalContainerContext);

  return (
    <fieldset className="grid grid-cols-2 gap-1.5">
      <legend className="pb-1 font-bold">{t("manga.reader.background")}</legend>
      {readerBackgrounds.map((value) => (
        <Button
          key={value}
          variant={background === value ? "outline" : "default"}
          aria-pressed={background === value}
          className="justify-start gap-1.5"
          onClick={() => patchSettings({ mangaReaderBackground: value })}
        >
          <span
            aria-hidden
            className="size-3 shrink-0 border border-neutral-500"
            style={{ backgroundColor: readerPalette[value].backgroundColor }}
          />
          {t(`manga.reader.background.${value}`)}
        </Button>
      ))}
      <div className="col-span-2 flex items-center gap-1">
        <Button
          variant={background === "custom" ? "outline" : "default"}
          aria-pressed={background === "custom"}
          className="min-w-0 flex-1 justify-start gap-1.5"
          onClick={() => patchSettings({ mangaReaderBackground: "custom" })}
        >
          <span
            aria-hidden
            className="size-3 shrink-0 border border-neutral-500"
            style={{ backgroundColor: custom }}
          />
          {t("manga.reader.background.custom")}
        </Button>
        <ColorPickerTrigger
          container={portal}
          label={t("manga.reader.background.custom")}
          value={custom}
          onChange={(mangaReaderBackgroundCustom) =>
            patchSettings({ mangaReaderBackgroundCustom, mangaReaderBackground: "custom" })
          }
        />
      </div>
    </fieldset>
  );
}
