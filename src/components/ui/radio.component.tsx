import { enterOrSpace } from "@/lib/keyboard.utils";

function Radio({
  checked,
  onChange,
  disabled,
  className,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <span
      role="radio"
      aria-checked={checked}
      tabIndex={disabled ? -1 : 0}
      className={`text-text inline-flex size-[var(--ui-check-size)] shrink-0 items-center justify-center bg-white ${disabled ? "opacity-50" : "cursor-pointer"} ${className ?? ""}`}
      style={{
        border: "1px solid",
        borderBottomColor: "var(--color-win-highlight)",
        borderLeftColor: "var(--color-win-shadow)",
        borderRightColor: "var(--color-win-highlight)",
        borderTopColor: "var(--color-win-shadow)",
        boxShadow: "inset 1px 1px 0 rgba(0,0,0,0.15)",
      }}
      onClick={disabled ? undefined : () => onChange(!checked)}
      onKeyDown={disabled ? undefined : enterOrSpace(() => onChange(!checked))}
    >
      {checked && (
        <span
          className="size-1.5 shrink-0"
          style={{ backgroundColor: "var(--color-text)" }}
        />
      )}
    </span>
  );
}

export { Radio };
