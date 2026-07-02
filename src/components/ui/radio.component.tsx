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
      className={`inline-flex items-center justify-center size-4 bg-white text-text shrink-0 ${disabled ? "opacity-50" : "cursor-pointer"} ${className ?? ""}`}
      style={{
        border: "1px solid",
        borderTopColor: "var(--color-win-shadow)",
        borderLeftColor: "var(--color-win-shadow)",
        borderBottomColor: "var(--color-win-highlight)",
        borderRightColor: "var(--color-win-highlight)",
        boxShadow: "inset 1px 1px 0 rgba(0,0,0,0.15)",
      }}
      onClick={disabled ? undefined : () => onChange(!checked)}
      onKeyDown={(e) => {
        if (disabled) return;
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          onChange(!checked);
        }
      }}
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
