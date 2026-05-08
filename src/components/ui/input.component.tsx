import * as React from "react";
import { Input as InputPrimitive } from "@base-ui/react/input";

import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "h-[21px] w-full min-w-0 border-2 border-solid border-t-muted border-l-muted border-b-white border-r-white bg-white px-1.5 text-text text-[11px] font-['MS_Sans_Serif','Microsoft_Sans_Serif','Segoe_UI',system-ui] outline-none file:inline-flex file:h-[17px] file:border-2 file:border-solid file:border-t-white file:border-l-white file:border-b-muted file:border-r-muted file:bg-primary file:px-1 file:text-[11px] file:text-text file:font-['MS_Sans_Serif','Microsoft_Sans_Serif','Segoe_UI',system-ui] file:mr-1 file:active:border-t-muted file:active:border-l-muted file:active:border-b-white file:active:border-r-white placeholder:text-muted focus-visible:outline-dotted focus-visible:outline-1 focus-visible:outline-offset-[-3px] focus-visible:outline-text disabled:pointer-events-none disabled:bg-primary disabled:text-muted disabled:opacity-50 aria-invalid:border-destructive",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
