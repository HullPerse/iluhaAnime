import { AlertTriangle, RefreshCw } from "lucide-react";

import { SmallLoader } from "@/components/shared/loader.component";
import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/lib/i18n";

export function SqliteHeader({
  mode,
  setMode,
  onRefresh,
  loading,
  deleting,
  error,
}: {
  mode: "browse" | "query";
  setMode: (mode: "browse" | "query") => void;
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
        <span className="text-hint windows95-text text-xs">{t("settings.sqlite.read.only.hint")}</span>
        <div className="ml-auto flex items-center gap-1">
          <Button
            variant={mode === "browse" ? "outline" : "default"}
            className="h-5"
            onClick={() => setMode("browse")}
          >
            {t("settings.sqlite.mode.browse")}
          </Button>
          <Button
            variant={mode === "query" ? "outline" : "default"}
            className="h-5"
            onClick={() => setMode("query")}
          >
            {t("settings.sqlite.mode.query")}
          </Button>
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
          <span>
            {mode === "query" ? t("settings.sqlite.query.hint") : t("settings.sqlite.safety.hint")}
          </span>
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
