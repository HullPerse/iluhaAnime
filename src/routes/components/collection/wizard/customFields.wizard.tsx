import { Plus } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button.component";
import { FIELD_TYPES } from "@/config/collection/defaults.config";
import { useCollectionMutations } from "@/hooks/collection/queries.hook";
import { useI18n } from "@/lib/locale/i18n.utils";
import type { CustomFieldDef } from "@/types/collection";

import { WizardCustomFieldInput } from "./customFieldInput.wizard";

export function WizardCustomFields({
  defs,
  values,
  onChange,
}: {
  defs: CustomFieldDef[];
  values: Record<string, unknown>;
  onChange: React.Dispatch<React.SetStateAction<Record<string, unknown>>>;
}) {
  const { t } = useI18n();
  const [showBuilder, setShowBuilder] = useState(false);
  const [fieldName, setFieldName] = useState("");
  const [fieldType, setFieldType] = useState<(typeof FIELD_TYPES)[number]>("text");
  const [fieldOptions, setFieldOptions] = useState("");
  const { addCustomFieldDef } = useCollectionMutations();

  const addField = async () => {
    const opts =
      fieldType === "select" && fieldOptions.trim()
        ? fieldOptions
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : null;
    await addCustomFieldDef({
      name: fieldName.trim(),
      fieldType,
      options: opts,
    });
    setFieldName("");
    setFieldOptions("");
    setShowBuilder(false);
  };

  return (
    <div className="windows95-border bg-white p-2">
      <div className="flex items-center justify-between">
        <strong className="text-xs">{t("collection.wizard.custom.fields")}</strong>
        <Button
          size="icon"
          className="size-5"
          onClick={() => setShowBuilder((v) => !v)}
          aria-label={t("collection.wizard.custom.fields")}
        >
          <Plus className="size-3" />
        </Button>
      </div>
      {showBuilder && (
        <div className="windows95-border bg-primary mt-1 p-1">
          <input
            value={fieldName}
            onChange={(e) => setFieldName(e.target.value)}
            placeholder={t("collection.wizard.title")}
            className="windows95-border mb-1 w-full bg-white px-2 py-1 text-xs"
          />
          <select
            value={fieldType}
            onChange={(e) => setFieldType(e.target.value as typeof fieldType)}
            className="windows95-border mb-1 w-full bg-white px-1 py-0.5 text-xs"
          >
            {FIELD_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
          {fieldType === "select" && (
            <input
              value={fieldOptions}
              onChange={(e) => setFieldOptions(e.target.value)}
              placeholder="opt1, opt2, opt3"
              className="windows95-border mb-1 w-full bg-white px-2 py-1 text-xs"
            />
          )}
          <Button size="icon" className="size-5" disabled={!fieldName.trim()} onClick={addField}>
            <Plus className="size-3" />
          </Button>
        </div>
      )}
      {defs.map((def) => (
        <label key={def.id} className="mt-1 flex flex-col gap-1 text-xs">
          {def.name}
          <WizardCustomFieldInput def={def} value={values[def.id]} onChange={onChange} />
        </label>
      ))}
    </div>
  );
}
