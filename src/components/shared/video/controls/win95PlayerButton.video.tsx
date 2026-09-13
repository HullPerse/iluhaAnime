import { cn } from "cn";
import type { ButtonHTMLAttributes } from "react";

export function Win95PlayerButton({
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        "windows95-active-border bg-primary text-text flex size-6 shrink-0 cursor-pointer items-center justify-center hover:brightness-110 active:translate-x-px active:translate-y-px",
        className
      )}
    />
  );
}
