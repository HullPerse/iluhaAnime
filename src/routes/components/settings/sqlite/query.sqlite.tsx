import { sql } from "@codemirror/lang-sql";
import CodeMirror from "@uiw/react-codemirror";
import { Play } from "lucide-react";

import { SmallLoader } from "@/components/shared/loader.component";
import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/lib/locale/i18n.utils";

export function QueryPanel({
  querySql,
  setQuerySql,
  runQuery,
  navigateHistory,
  queryLoading,
  canRun,
  getHistoryCount,
}: {
  querySql: string;
  setQuerySql: (sql: string) => void;
  runQuery: () => void;
  navigateHistory: (direction: "up" | "down") => void;
  queryLoading: boolean;
  canRun: boolean;
  getHistoryCount: () => number;
}) {
  const { t } = useI18n();
  return (
    <section className="ui-panel p-2">
      <div className="mb-1 flex items-center gap-1 text-xs">
        <strong>{t("settings.sqlite.query.title")}</strong>
        <span className="text-hint">{t("settings.sqlite.query.history")}</span>
      </div>
      <div
        className="windows95-border overflow-hidden bg-white"
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
            e.preventDefault();
            runQuery();
          } else if (e.key === "ArrowUp" && getHistoryCount() > 0 && (e.ctrlKey || e.altKey)) {
            e.preventDefault();
            navigateHistory("up");
          } else if (e.key === "ArrowDown" && getHistoryCount() > 0 && (e.ctrlKey || e.altKey)) {
            e.preventDefault();
            navigateHistory("down");
          }
        }}
      >
        <CodeMirror
          value={querySql}
          height="80px"
          extensions={[sql()]}
          onChange={(v) => setQuerySql(v)}
          placeholder={t("settings.sqlite.query.placeholder")}
          editable={!queryLoading}
          basicSetup={{ lineNumbers: false, foldGutter: false, highlightActiveLine: false }}
          style={{ fontSize: "12px" }}
        />
      </div>
      <div className="mt-1 flex items-center justify-between gap-1">
        <span className="text-hint text-xs">{t("settings.sqlite.query.shortcut")}</span>
        <Button
          className="h-5"
          variant="success"
          onClick={runQuery}
          disabled={queryLoading || !canRun}
        >
          {queryLoading ? <SmallLoader /> : <Play className="size-3" />}
          {t("settings.sqlite.query.run")}
        </Button>
      </div>
    </section>
  );
}
