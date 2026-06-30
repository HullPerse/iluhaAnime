import * as React from "react";
import { Input as InputPrimitive } from "@base-ui/react/input";

import { cn } from "@/lib/index.utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      autoComplete="off"
      type={type}
      data-slot="input"
      className={cn(
        "bg-white h-6 w-full min-w-0 windows95-border px-1.5 text-text windows95-text outline-none file:inline-flex file:h-5 file:border-2 file:border-solid file:border-t-white file:border-l-white file:border-b-muted file:border-r-muted file:bg-primary file:px-1 file:windows95-text file:text-text file:mr-1 file:active:border-t-muted file:active:border-l-muted file:active:border-b-white file:active:border-r-white placeholder:text-muted focus-visible:outline-dotted focus-visible:outline-1 focus-visible:outline-offset-[-3px] focus-visible:outline-text disabled:pointer-events-none disabled:bg-primary disabled:text-muted disabled:opacity-50 aria-invalid:border-destructive",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
