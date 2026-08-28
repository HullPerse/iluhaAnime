import { Plus } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button.component";
import { useCollectionMutations } from "@/lib/collection.queries";
import { useI18n } from "@/lib/i18n";
import type { CustomFieldDef } from "@/types/collection";

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
  const [fieldType, setFieldType] = useState<
    "text" | "number" | "select" | "date"
  >("text");
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
        <strong className="text-xs">
          {t("collection.wizard.customFields")}
        </strong>
        <Button
          size="icon"
          className="size-5"
          onClick={() => setShowBuilder((v) => !v)}
          aria-label={t("collection.wizard.customFields")}
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
            <option value="text">{t("collection.wizard.title")}</option>
            <option value="number">Number</option>
            <option value="select">{t("collection.wizard.priority")}</option>
            <option value="date">Date</option>
          </select>
          {fieldType === "select" && (
            <input
              value={fieldOptions}
              onChange={(e) => setFieldOptions(e.target.value)}
              placeholder="opt1, opt2, opt3"
              className="windows95-border mb-1 w-full bg-white px-2 py-1 text-xs"
            />
          )}
          <Button
            size="icon"
            className="size-5"
            disabled={!fieldName.trim()}
            onClick={addField}
          >
            <Plus className="size-3" />
          </Button>
        </div>
      )}
      {defs.map((def) => (
        <label key={def.id} className="mt-1 flex flex-col gap-1 text-xs">
          {def.name}
          <WizardCustomFieldInput
            def={def}
            value={values[def.id]}
            onChange={onChange}
          />
        </label>
      ))}
    </div>
  );
}

export function WizardCustomFieldInput({
  def,
  value,
  onChange,
}: {
  def: CustomFieldDef;
  value: unknown;
  onChange: React.Dispatch<React.SetStateAction<Record<string, unknown>>>;
}) {
  const update = (next: string) =>
    onChange((prev) => ({ ...prev, [def.id]: next }));

  if (def.fieldType === "select") {
    return (
      <select
        value={String(value ?? "")}
        onChange={(e) => update(e.target.value)}
        className="windows95-border bg-white px-2 py-1"
      >
        <option value="">-</option>
        {def.options?.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    );
  }
  if (def.fieldType === "number") {
    return (
      <input
        type="number"
        value={String(value ?? "")}
        onChange={(e) => update(e.target.value)}
        className="windows95-border bg-white px-2 py-1"
      />
    );
  }
  return (
    <input
      value={String(value ?? "")}
      onChange={(e) => update(e.target.value)}
      className="windows95-border bg-white px-2 py-1"
    />
  );
}