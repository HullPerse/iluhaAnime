import { SmallLoader } from "@/components/shared/loader/small.loader";
import { useI18n } from "@/hooks/i18n.hook";

export function DetailsLoading() {
  const { t } = useI18n();
  return (
    <div className="flex min-h-48 flex-col items-center justify-center gap-2">
      <SmallLoader size={6} />
      <span className="windows95-text">{t("search.details.loading")}</span>
    </div>
  );
}
