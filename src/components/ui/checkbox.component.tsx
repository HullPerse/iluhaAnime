import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox";
import { cn } from "cn";
import { Check, Minus } from "lucide-react";

function Checkbox({
  checked,
  onChange,
  disabled,
  indeterminate,
  className,
  "aria-label": ariaLabel,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  indeterminate?: boolean;
  className?: string;
  "aria-label"?: string;
}) {
  return (
    <CheckboxPrimitive.Root
      checked={checked}
      indeterminate={indeterminate}
      onCheckedChange={(v) => onChange(v)}
      disabled={disabled}
      aria-label={ariaLabel}
      className={cn(
        "windows95-border text-text windows95-text bg-field inline-flex size-[var(--ui-check-size)] shrink-0 items-center justify-center leading-none font-bold",
        disabled ? "cursor-default opacity-50" : "cursor-pointer",
        className
      )}
    >
      <CheckboxPrimitive.Indicator>
        {indeterminate ? (
          <Minus className="size-3" aria-hidden />
        ) : (
          <Check className="size-3" aria-hidden />
        )}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
