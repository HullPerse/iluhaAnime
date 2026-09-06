import { ArrowDown, ArrowUp, Check } from "lucide-react";

import { Button } from "@/components/ui/button.component";
import { Input } from "@/components/ui/input.component";
import { useI18n } from "@/lib/locale/i18n.utils";
import { enterSubmit } from "@/lib/utils/keyboard.utils";
import type { SpeedTorrentProps as Props } from "@/types/torrent";

export default function SpeedLimitForm({
  limits,
  downloadInput,
  uploadInput,
  onDownloadChange,
  onUploadChange,
  onApply,
}: Props) {
  const effective = (input: string) => (input === "" ? null : Number(input));
  const { t } = useI18n();
  const invalid =
    (downloadInput !== "" && !(Number(downloadInput) > 0)) ||
    (uploadInput !== "" && !(Number(uploadInput) > 0));
  return (
    <section className="windows95-active-border bg-primary flex items-center gap-2 p-1">
      <span className="windows95-text">
        <ArrowDown />
      </span>
      <Input
        type="number"
        className="w-16"
        placeholder="KB/s"
        value={downloadInput}
        onChange={(e) => {
          if (e.target.value === "" || /^\d+$/.test(e.target.value)) {
            onDownloadChange(e.target.value);
          }
        }}
        onKeyDown={enterSubmit(onApply)}
        onBlur={onApply}
      />
      <span className="windows95-text">
        <ArrowUp />
      </span>
      <Input
        type="number"
        className="w-16"
        placeholder="KB/s"
        value={uploadInput}
        onChange={(e) => {
          if (e.target.value === "" || /^\d+$/.test(e.target.value)) {
            onUploadChange(e.target.value);
          }
        }}
        onKeyDown={enterSubmit(onApply)}
        onBlur={onApply}
      />
      <Button
        size="icon"
        className="windows95-text size-6"
        onClick={onApply}
        disabled={
          effective(downloadInput) === limits.download && effective(uploadInput) === limits.upload
        }
        title={invalid ? t("torrent.limits.invalid") : undefined}
      >
        <Check className="size-4" />
      </Button>
      {invalid && <span className="text-destructive text-xs">{t("torrent.limits.invalid")}</span>}
    </section>
  );
}
