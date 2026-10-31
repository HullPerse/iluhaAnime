import { SmallLoader } from "@/components/shared/loader/small.loader";
import { useI18n } from "@/hooks/i18n.hook";

export function SqliteBrowseStatus({ loading, empty }: { loading: boolean; empty: boolean }) {
  const { t } = useI18n();

  if (loading) {
    return (
      <div className="flex min-h-40 items-center justify-center">
        <SmallLoader />
      </div>
    );
  }
  if (!empty) return null;
  return (
    <div className="text-hint flex min-h-40 items-center justify-center p-3 text-xs">
      {t("settings.sqlite.empty")}
    </div>
  );
}
