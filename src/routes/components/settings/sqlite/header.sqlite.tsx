import { AlertTriangle, RefreshCw } from "lucide-react";

import { SmallLoader } from "@/components/shared/loader.component";
import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/lib/locale/i18n.utils";

export function SqliteHeader({
  onRefresh,
  loading,
  deleting,
  error,
}: {
  onRefresh: () => void;
  loading: boolean;
  deleting: boolean;
  error: string | null;
}) {
  const { t } = useI18n();
  return (
    <>
      <section className="ui-toolbar ui-panel">
        <strong className="windows95-text text-xs">{t("settings.sqlite.title")}</strong>
        <div className="ml-auto flex items-center gap-1">
          <Button
            size="icon"
            className="size-6"
            onClick={onRefresh}
            disabled={loading || deleting}
            title={t("settings.sqlite.refresh")}
          >
            {loading ? <SmallLoader /> : <RefreshCw className="size-3" />}
          </Button>
        </div>
      </section>

      <section className="ui-panel p-2 text-xs">
        <div className="flex items-start gap-1">
          <AlertTriangle className="text-highlight mt-0.5 size-3 shrink-0" />
          <span>{t("settings.sqlite.safety.hint")}</span>
        </div>
      </section>

      {error && (
        <section className="windows95-border bg-destructive/10 text-destructive p-2 text-xs">
          {error}
        </section>
      )}
    </>
  );
}
