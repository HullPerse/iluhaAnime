import type { CustomFieldDef } from "@/types/collection";

export function WizardCustomFieldInputCollection({
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
