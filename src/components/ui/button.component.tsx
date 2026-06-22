import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center windows95-active-border bg-primary text-text windows95-text whitespace-nowrap transition-none outline-none select-none windows95-active-border active:translate-x-px active:translate-y-px disabled:pointer-events-none disabled:opacity-50 disabled:border-t-muted disabled:border-l-muted disabled:border-b-white disabled:border-r-white disabled:translate-x-0 disabled:translate-y-0 focus-visible:outline-dotted focus-visible:outline-1 focus-visible:outline-offset-[-3px] focus-visible:outline-text [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5 hover:cursor-pointer",
  {
    variants: {
      variant: {
        default: "",
        outline:
          "bg-white border-t-muted border-l-muted border-b-white border-r-white",
        secondary: "bg-surface",
        ghost:
          "border-transparent bg-transparent hover:bg-primary hover:border-t-white hover:border-l-white hover:border-b-muted hover:border-r-muted",
        destructive: "text-destructive active:text-white active:bg-destructive",
        link: "border-transparent bg-transparent text-highlight underline hover:text-link-hover hover:underline active:translate-x-0 active:translate-y-0",
        success: "bg-primary text-success active:text-white active:bg-success",
        error:
          "bg-primary text-destructive active:text-white active:bg-destructive",
      },
      size: {
        default:
          "h-[23px] gap-1 px-1.5 has-data-[icon=inline-end]:pr-1 has-data-[icon=inline-start]:pl-1",

        icon: "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant = "default",
  size = "default",
  rendered = true,
  ...props
}: ButtonPrimitive.Props &
  VariantProps<typeof buttonVariants> & {
    rendered?: boolean;
  }) {
  if (!rendered) return;

  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
