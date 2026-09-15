import { Radio as BaseRadio } from "@base-ui/react/radio";
import { cn } from "cn";

export function Radio({
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
        "text-text inline-flex size-(--ui-check-size) shrink-0 items-center justify-center bg-field",
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
