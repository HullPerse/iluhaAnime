import { Input as InputPrimitive } from "@base-ui/react/input";
import * as React from "react";

import { cn } from "@/lib/index.utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <InputPrimitive
        ref={ref}
        autoComplete="off"
        type={type}
        data-slot="input"
        className={cn(
          "windows95-border text-text windows95-text file:bg-primary file:windows95-text file:text-text placeholder:text-muted focus-visible:outline-text disabled:bg-primary disabled:text-muted aria-invalid:border-destructive min-h-[var(--ui-control-height)] w-full min-w-0 bg-white px-1.5 outline-none file:mr-1 file:inline-flex file:h-5 file:px-1 focus-visible:outline-1 focus-visible:outline-offset-[-3px] focus-visible:outline-dotted disabled:pointer-events-none disabled:opacity-50",
          className
        )}
        {...props}
      />
    );
  }
);

export { Input };
