import { RadioGroup as BaseRadioGroup } from "@base-ui/react/radio-group";
import type { ReactNode } from "react";

export function RadioGroup<T extends string>({
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
