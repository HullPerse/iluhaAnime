import { useI18n } from "@/hooks/i18n.hook";

export function StreamLoadingGrid({ count = 12 }: { count?: number }) {
  const { t } = useI18n();
  return (
    <section
      className="windows95-border bg-field min-h-0 w-full flex-1 overflow-hidden p-1"
      role="status"
      aria-busy="true"
    >
      <span className="sr-only">{t("stream.loading")}</span>
      <div className="grid [grid-template-columns:repeat(auto-fill,minmax(7.5rem,1fr))] content-start gap-2">
        {Array.from({ length: count }, (_, index) => (
          <div
            key={index}
            aria-hidden
            className="windows95-active-border bg-field flex flex-col overflow-hidden"
          >
            <span className="bg-surface block aspect-3/4 w-full animate-pulse" />
            <span className="bg-primary flex h-9 flex-col justify-center gap-1 px-1">
              <span className="bg-surface block h-2 w-3/4 animate-pulse" />
              <span className="bg-surface block h-2 w-1/2 animate-pulse" />
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
