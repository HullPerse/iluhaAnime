import { Check } from "lucide-react";

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
        "windows95-border text-text windows95-text inline-flex size-[var(--ui-check-size)] shrink-0 items-center justify-center bg-white leading-none font-bold",
        disabled ? "cursor-default opacity-50" : "cursor-pointer",
        className
      )}
    >
      <CheckboxPrimitive.Indicator>
        <Check className="size-3" aria-hidden />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
