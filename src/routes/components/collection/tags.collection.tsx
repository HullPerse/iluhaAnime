import Modal from "@/components/shared/modal.component";
import { Button } from "@/components/ui/button.component";
import { Input } from "@/components/ui/input.component";
import { clampTolerance, DEFAULT_TAG_TOLERANCES } from "@/config/search/tolerance.config";
import { useI18n } from "@/lib/locale/i18n.utils";
import { FILTER_KEYS } from "@/lib/search/intent.utils";
import { useSettingsStore } from "@/store/settings.store";
import type { TagToleranceKey } from "@/types/search";

const NUMERIC_KEYS: TagToleranceKey[] = ["year", "rating", "episodes", "progress"];
const NUMERIC_SET = new Set<string>(NUMERIC_KEYS);

const EXAMPLE_BY_KEY: Record<string, string> = {
  studio: "studio=mappa|ufotable",
  genre: "genre=action|drama",
  type: "type=anime|movie",
  status: "status=watching|planned",
  priority: "priority=high|normal",
  provider: "provider=anilist|tmdb",
  source: "source=tmdb|custom",
  tag: "tag=fantasy|romance",
};

function exampleFor(key: string): string {
  if (NUMERIC_SET.has(key))
    return `${key}>=${key === "rating" ? "8" : key === "year" ? "2000" : "12"}`;
  if (key === "sort") return "sort=rating:desc";
  if (key === "date") return 'date="31.01.2025"';
  return EXAMPLE_BY_KEY[key] ?? `${key}=action|drama`;
}

function opsFor(key: string): string {
  if (NUMERIC_SET.has(key)) return "=, ~=, !=, >, <, >=, <=";
  if (key === "sort") return "=";
  if (key === "date") return "=, !=, >, <, >=, <=";
  return "=, !=";
}

export function TagsReferenceModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const tagTolerances = useSettingsStore((s) => s.tagTolerances);
  const patchSettings = useSettingsStore((s) => s.patch);
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
        <li className="windows95-text text-hint text-xs">{t("collection.tags.range")}</li>
      </ul>
      <p className="windows95-text text-xs">{t("collection.tags.approx.title")}</p>
      <ul className="windows95-border flex flex-col gap-1 bg-white p-1">
        {NUMERIC_KEYS.map((key) => (
          <li key={key} className="flex flex-row items-center gap-2 text-xs">
            <span className="windows95-text w-20 shrink-0 font-bold">{key}~=</span>
            <Input
              type="number"
              min={0}
              max={99}
              value={tagTolerances[key]}
              aria-label={key}
              className="h-5 w-16 text-xs"
              onChange={(e) =>
                patchSettings({
                  tagTolerances: {
                    ...tagTolerances,
                    [key]: clampTolerance(Number(e.target.value)),
                  },
                })
              }
            />
          </li>
        ))}
      </ul>
      <Button
        className="h-5 self-start px-1 text-xs"
        onClick={() => patchSettings({ tagTolerances: { ...DEFAULT_TAG_TOLERANCES } })}
      >
        {t("collection.tags.approx.reset")}
      </Button>
    </Modal>
  );
}
