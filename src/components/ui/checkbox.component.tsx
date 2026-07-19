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
        "windows95-border inline-flex items-center justify-center size-4 bg-white text-text font-bold leading-none shrink-0 windows95-text",
        disabled ? "opacity-50 cursor-default" : "cursor-pointer",
        className,
      )}
    >
      <CheckboxPrimitive.Indicator>
        <span style={{ transform: "scaleX(1.4)" }}>✓</span>
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
