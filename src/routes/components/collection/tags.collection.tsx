import Modal from "@/components/shared/modal.component";
import { useI18n } from "@/lib/locale/i18n.utils";
import { FILTER_KEYS } from "@/lib/search/intent.utils";

const NUMERIC_KEYS = new Set(["year", "rating", "episodes", "progress"]);

function exampleFor(key: string): string {
  if (NUMERIC_KEYS.has(key))
    return `${key}>=${key === "rating" ? "8" : key === "year" ? "2000" : "12"}`;
  if (key === "sort") return "sort=rating:desc";
  if (key === "date") return 'date="31.01.2025"';
  return `${key}=action|drama`;
}

function opsFor(key: string): string {
  if (NUMERIC_KEYS.has(key)) return "=, !=, >, <, >=, <=";
  if (key === "sort") return "=";
  if (key === "date") return "=, !=, >, <, >=, <=";
  return "=, !=";
}

export function TagsReferenceModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  if (!open) return null;
  return (
    <Modal header={t("collection.tags.title")} onClose={onClose} className="min-w-md">
      <p className="windows95-text text-xs">{t("collection.tags.hint")}</p>
      <ul className="windows95-border flex max-h-80 flex-col gap-0.5 overflow-y-auto bg-white p-1">
        {Object.keys(FILTER_KEYS).map((key) => (
          <li key={key} className="windows95-text flex flex-row items-baseline gap-2 text-xs">
            <span className="w-20 shrink-0 font-bold">{key}</span>
            <span className="text-hint w-32 shrink-0">{opsFor(key)}</span>
            <span className="min-w-0 flex-1 truncate" title={exampleFor(key)}>
              {exampleFor(key)}
            </span>
          </li>
        ))}
        <li className="windows95-text text-hint pt-1 text-xs">{t("collection.tags.or")}</li>
      </ul>
    </Modal>
  );
}
