import { useI18n } from "@/lib/i18n";
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
  onCustomFieldsChange: React.Dispatch<
    React.SetStateAction<Record<string, unknown>>
  >;
}) {
  const { t } = useI18n();
  return (
    <div className="windows95-border flex flex-col gap-1 bg-white p-1">
      <label className="flex flex-col gap-0.5 text-xs">
        {t("collection.wizard.altTitles")}
        <input
          value={props.altTitles}
          onChange={(e) => props.setAltTitles(e.target.value)}
          className="windows95-border bg-white px-1 py-0.5"
        />
      </label>
      <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
        <label className="flex flex-col gap-0.5 text-xs">
          {t("collection.wizard.year")}
          <input
            type="number"
            value={props.year}
            onChange={(e) => props.setYear(e.target.value)}
            className="windows95-border bg-white px-1 py-0.5"
          />
        </label>
        <label className="flex flex-col gap-0.5 text-xs">
          {t("collection.wizard.duration")}
          <input
            type="number"
            value={props.durationMinutes}
            onChange={(e) => props.setDurationMinutes(e.target.value)}
            placeholder="min"
            className="windows95-border bg-white px-1 py-0.5"
          />
        </label>
        <label className="flex flex-col gap-0.5 text-xs">
          {t("collection.wizard.studio")}
          <input
            value={props.studio}
            onChange={(e) => props.setStudio(e.target.value)}
            className="windows95-border bg-white px-1 py-0.5"
          />
        </label>
      </div>
      <label className="flex flex-col gap-0.5 text-xs">
        {t("collection.wizard.genres")}
        <input
          value={props.genres}
          onChange={(e) => props.setGenres(e.target.value)}
          placeholder="Action, Drama"
          className="windows95-border bg-white px-1 py-0.5"
        />
      </label>
      <div className="grid grid-cols-2 gap-1">
        <label className="flex flex-col gap-0.5 text-xs">
          {t("collection.wizard.startedAt")}
          <input
            type="date"
            value={props.startedAt}
            onChange={(e) => props.setStartedAt(e.target.value)}
            className="windows95-border bg-white px-1 py-0.5"
          />
        </label>
        <label className="flex flex-col gap-0.5 text-xs">
          {t("collection.wizard.finishedAt")}
          <input
            type="date"
            value={props.finishedAt}
            onChange={(e) => props.setFinishedAt(e.target.value)}
            className="windows95-border bg-white px-1 py-0.5"
          />
        </label>
      </div>
      <WizardLinkedIds externalIds={props.externalIds} />
      <label className="flex flex-col gap-0.5 text-xs">
        {t("collection.wizard.description")}
        <textarea
          value={props.description}
          onChange={(e) => props.setDescription(e.target.value)}
          rows={2}
          className="windows95-border bg-white px-1 py-0.5"
        />
      </label>
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