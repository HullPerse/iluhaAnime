import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva } from "class-variance-authority";
import type { VariantProps } from "class-variance-authority";

import { cn } from "@/lib/index.utils";
import { useSettingsStore } from "@/store/settings.store";

const buttonVariants = cva(
  "group/button windows95-active-border bg-primary text-text windows95-text disabled:border-t-muted disabled:border-l-muted disabled:border-b-win-highlight disabled:border-r-win-highlight focus-visible:outline-text inline-flex shrink-0 items-center justify-center whitespace-nowrap transition-none outline-none select-none hover:cursor-pointer focus-visible:outline-1 focus-visible:outline-offset-[-3px] focus-visible:outline-dotted disabled:pointer-events-none disabled:translate-x-0 disabled:translate-y-0 disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
  {
    defaultVariants: {
      size: "default",
      variant: "default",
    },
    variants: {
      size: {
        default:
          "min-h-[var(--ui-control-height)] gap-1 px-1.5 has-data-[icon=inline-end]:pr-1 has-data-[icon=inline-start]:pl-1",

        icon: "size-[var(--ui-icon-size)]",
      },
      variant: {
        default: "",
        destructive: "text-destructive active:bg-destructive active:text-white",
        error:
          "bg-primary text-destructive active:bg-destructive active:text-white",
        ghost:
          "hover:bg-primary hover:border-b-muted hover:border-r-muted border-transparent bg-transparent hover:border-t-white hover:border-l-white",
        link: "text-highlight hover:text-link-hover border-transparent bg-transparent underline hover:underline active:translate-x-0 active:translate-y-0",
        outline:
          "border-t-muted border-l-muted border-r-white border-b-white bg-white",
        secondary: "bg-surface",
        success: "bg-primary text-success active:bg-success active:text-white",
      },
    },
  }
);

function Button({
  className,
  variant = "default",
  size = "default",
  rendered = true,
  type = "button",
  ...props
}: ButtonPrimitive.Props &
  VariantProps<typeof buttonVariants> & {
    rendered?: boolean;
  }) {
  if (!rendered) return null;

  const buttonPressEffect = useSettingsStore((s) => s.buttonPressEffect);

  return (
    <ButtonPrimitive
      data-slot="button"
      type={type}
      className={cn(
        buttonVariants({ size, variant }),
        buttonPressEffect && "active:translate-x-px active:translate-y-px",
        className
      )}
      {...props}
    />
  );
}

export { Button };
