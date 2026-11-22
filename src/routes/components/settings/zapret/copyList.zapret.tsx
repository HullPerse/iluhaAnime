import { useI18n } from "@/hooks/i18n.hook";
import { CopyButton } from "@/routes/components/settings/zapret/copyButton.zapret";

export function CopyList({
  title,
  value,
  sectionId,
}: {
  title: string;
  value: string;
  sectionId: string;
}) {
  const { t } = useI18n();
  const lines = value.split("\n").length;

  return (
    <section className="ui-panel" data-find-section={sectionId}>
      <div className="ui-titlebar group flex items-center justify-between gap-1">
        <span className="text-title-text font-bold">{title}</span>
      </div>
      <div className="flex flex-col gap-2 p-2">
        <div className="flex flex-wrap items-center gap-2">
          <CopyButton value={value} />
          <span className="text-hint windows95-text text-xs">
            {t("settings.zapret.lines", { count: lines })}
          </span>
        </div>
        <pre className="bg-field windows95-border max-h-52 overflow-auto p-2 font-mono text-xs leading-4 break-all whitespace-pre-wrap select-all">
          {value}
        </pre>
      </div>
    </section>
  );
}
