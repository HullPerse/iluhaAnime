import { Radio as BaseRadio } from "@base-ui/react/radio";
import { RadioGroup as BaseRadioGroup } from "@base-ui/react/radio-group";
import { cn } from "cn";
import type { ReactNode } from "react";

function RadioGroup<T extends string>({
  value,
  onChange,
  disabled,
  className,
  children,
}: {
  value: T;
  onChange: (v: T) => void;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <BaseRadioGroup
      value={value}
      onValueChange={onChange}
      disabled={disabled}
      className={className}
    >
      {children}
    </BaseRadioGroup>
  );
}

function Radio({
  value,
  disabled,
  className,
}: {
  value: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <BaseRadio.Root
      value={value}
      disabled={disabled}
      className={cn(
        "text-text inline-flex size-(--ui-check-size) shrink-0 items-center justify-center bg-white",
        disabled ? "opacity-50" : "cursor-pointer",
        className
      )}
      style={{
        border: "1px solid",
        borderBottomColor: "var(--color-win-highlight)",
        borderLeftColor: "var(--color-win-shadow)",
        borderRightColor: "var(--color-win-highlight)",
        borderTopColor: "var(--color-win-shadow)",
        boxShadow: "inset 1px 1px 0 rgba(0,0,0,0.15)",
      }}
    >
      <BaseRadio.Indicator className="bg-text size-1.5 shrink-0" />
    </BaseRadio.Root>
  );
}

export { Radio, RadioGroup };
