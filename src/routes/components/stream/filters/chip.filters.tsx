export function ToggleChip({
  active,
  label,
  danger = false,
  onToggle,
}: {
  active: boolean;
  label: string;
  danger?: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onToggle}
      className={`windows95-text windows95-border cursor-pointer px-1 py-0.5 text-xs ${
        active ? "bg-secondary text-title-text" : "bg-field text-text hover:bg-surface"
      } ${danger && !active ? "text-destructive" : ""}`}
    >
      {label}
    </button>
  );
}
