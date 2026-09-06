import { useI18n } from "@/lib/locale/i18n.utils";
import type { CollectionItem, CustomFieldDef } from "@/types/collection";

import { WizardCustomFields } from "./customFields.wizard";
import { WizardLinkedIds } from "./linked.wizard";

export function WizardMoreFields(props: {
  altTitles: string;
  setAltTitles: (value: string) => void;
  year: string;
  setYear: (value: string) => void;
  durationMinutes: string;
  setDurationMinutes: (value: string) => void;
  studio: string;
  setStudio: (value: string) => void;
  genres: string;
  setGenres: (value: string) => void;
  startedAt: string;
  setStartedAt: (value: string) => void;
  finishedAt: string;
  setFinishedAt: (value: string) => void;
  externalIds: CollectionItem["externalIds"];
  description: string;
  setDescription: (value: string) => void;
  customFieldDefs: CustomFieldDef[];
  customFields: Record<string, unknown>;
  onCustomFieldsChange: React.Dispatch<React.SetStateAction<Record<string, unknown>>>;
}) {
  const { t } = useI18n();
  return (
    <div className="windows95-border bg-primary flex flex-col gap-1.5 p-2">
      <div className="grid grid-cols-[100px_1fr] gap-x-3 gap-y-1.5">
        <span className="text-text flex items-center text-xs font-bold">
          {t("collection.wizard.alt.titles")}
        </span>
        <input
          value={props.altTitles}
          onChange={(e) => props.setAltTitles(e.target.value)}
          className="windows95-border bg-white px-2 py-1 text-xs"
        />

        <span className="text-text flex items-center text-xs font-bold">
          {t("collection.wizard.year")}
        </span>
        <input
          value={props.year}
          onChange={(e) => props.setYear(e.target.value)}
          className="windows95-border bg-white px-2 py-1 text-xs"
        />

        <span className="text-text flex items-center text-xs font-bold">
          {t("collection.wizard.duration")}
        </span>
        <input
          value={props.durationMinutes}
          onChange={(e) => props.setDurationMinutes(e.target.value)}
          className="windows95-border bg-white px-2 py-1 text-xs"
        />

        <span className="text-text flex items-center text-xs font-bold">
          {t("collection.wizard.studio")}
        </span>
        <input
          value={props.studio}
          onChange={(e) => props.setStudio(e.target.value)}
          className="windows95-border bg-white px-2 py-1 text-xs"
        />

        <span className="text-text flex items-center text-xs font-bold">
          {t("collection.wizard.genres")}
        </span>
        <input
          value={props.genres}
          onChange={(e) => props.setGenres(e.target.value)}
          className="windows95-border bg-white px-2 py-1 text-xs"
        />

        <span className="text-text flex items-center text-xs font-bold">
          {t("collection.wizard.started.at")}
        </span>
        <input
          value={props.startedAt}
          onChange={(e) => props.setStartedAt(e.target.value)}
          className="windows95-border bg-white px-2 py-1 text-xs"
        />

        <span className="text-text flex items-center text-xs font-bold">
          {t("collection.wizard.finished.at")}
        </span>
        <input
          value={props.finishedAt}
          onChange={(e) => props.setFinishedAt(e.target.value)}
          className="windows95-border bg-white px-2 py-1 text-xs"
        />
      </div>

      <WizardLinkedIds externalIds={props.externalIds} />

      <div className="grid grid-cols-[100px_1fr] gap-x-3 gap-y-0.5">
        <span className="text-text flex items-center text-xs font-bold">
          {t("collection.wizard.description")}
        </span>
        <textarea
          value={props.description}
          onChange={(e) => props.setDescription(e.target.value)}
          rows={3}
          className="windows95-border bg-white px-2 py-1 text-xs"
        />
      </div>

      {props.customFieldDefs.length > 0 && (
        <WizardCustomFields
          defs={props.customFieldDefs}
          values={props.customFields}
          onChange={props.onCustomFieldsChange}
        />
      )}
    </div>
  );
}
