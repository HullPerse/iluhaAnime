export function ColorInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <input
      type="color"
      className="windows95-border bg-field h-5 w-12 cursor-pointer p-0"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}
