import { useI18n } from "@/lib/locale/i18n.utils";

export function SqliteObjectPane({
  object,
  onSelect,
}: {
  object: "tables" | "backup";
  onSelect: (value: "tables" | "backup") => void;
}) {
  const { t } = useI18n();
  const items = [
    { id: "tables", label: t("settings.sqlite.objects.tables") },
    { id: "backup", label: t("settings.sqlite.objects.backup") },
  ] as const;
  return (
    <ul className="windows95-border flex flex-col gap-1 bg-white">
      {items.map((item) => (
        <li key={item.id}>
          <button
            type="button"
            onClick={() => onSelect(item.id)}
            aria-pressed={object === item.id}
            className={`windows95-text w-full cursor-pointer px-1 py-0.5 text-left text-xs ${object === item.id ? "windows95-small-border bg-secondary font-bold text-white" : ""}`}
          >
            {item.label}
          </button>
        </li>
      ))}
    </ul>
  );
}
