import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox";
import { cn } from "@/lib/index.utils";

function Checkbox({
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
    <CheckboxPrimitive.Root
      checked={checked}
      onCheckedChange={(v) => onChange(v)}
      disabled={disabled}
      className={cn(
        "inline-flex items-center justify-center size-4 bg-white text-text font-bold leading-none shrink-0 windows95-text",
        disabled ? "opacity-50 cursor-default" : "cursor-pointer",
        className,
      )}
      style={{
        border: "1px solid",
        borderTopColor: "var(--color-win-shadow)",
        borderLeftColor: "var(--color-win-shadow)",
        borderBottomColor: "var(--color-win-highlight)",
        borderRightColor: "var(--color-win-highlight)",
        boxShadow: "inset 1px 1px 0 rgba(0,0,0,0.15)",
      }}
    >
      <CheckboxPrimitive.Indicator>
        <span style={{ transform: "scaleX(1.4)" }}>✓</span>
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
