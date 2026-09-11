import Select from "@/components/ui/select.component";

import type { CustomFieldDef } from "@/types/collection";

export function WizardCustomFieldInput({
  def,
  value,
  onChange,
}: {
  def: CustomFieldDef;
  value: unknown;
  onChange: React.Dispatch<React.SetStateAction<Record<string, unknown>>>;
}) {
  const update = (next: string) => onChange((prev) => ({ ...prev, [def.id]: next }));

  if (def.fieldType === "select") {
    return (
      <Select
        value={String(value ?? "")}
        onChange={(v) => update(v)}
        options={[
          { value: "", label: "-" },
          ...(def.options ?? []).map((opt) => ({ value: opt, label: opt })),
        ]}
        label={def.name}
      />
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
