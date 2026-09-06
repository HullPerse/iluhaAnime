import { Checkbox } from "@/components/ui/checkbox.component";
import { useI18n } from "@/lib/locale/i18n.utils";

export function ViewFlags({
  showImages,
  setShowImages,
  hideId,
  onHideIdChange,
}: {
  showImages: boolean;
  setShowImages: (value: boolean) => void;
  hideId: boolean;
  onHideIdChange: (value: boolean) => void;
}) {
  const { t } = useI18n();
  return (
    <>
      <label className="windows95-text flex items-center gap-1 text-xs select-none">
        <Checkbox checked={showImages} onChange={setShowImages} />
        {t("settings.sqlite.show.images")}
      </label>
      <label className="windows95-text flex items-center gap-1 text-xs select-none">
        <Checkbox checked={hideId} onChange={onHideIdChange} />
        {t("settings.sqlite.hide.id")}
      </label>
    </>
  );
}
