import { SmallLoader } from "@/components/shared/loader/small.loader";
import { useI18n } from "@/hooks/i18n.hook";

export function StreamInlineLoading({ label }: { label?: string }) {
  const { t } = useI18n();
  return (
    <span className="text-hint windows95-text flex items-center justify-center gap-1 p-2">
      <SmallLoader size={3} />
      {label ?? t("stream.loading")}
    </span>
  );
}
