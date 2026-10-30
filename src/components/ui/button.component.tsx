import { Button as ButtonPrimitive } from "@base-ui/react/button";
import type { VariantProps } from "class-variance-authority";
import { cn } from "cn";

import { SmallLoader } from "@/components/shared/loader/small.loader";
import { buttonVariants } from "@/config/ui/button.config";
import { useCell } from "@/lib/core/signal.hook";
import { settingsAtoms } from "@/store/settings.store";

function Button({
  className,
  variant = "default",
  size = "default",
  rendered = true,
  type = "button",
  loading = false,
  disabled,
  children,
  ...props
}: ButtonPrimitive.Props &
  VariantProps<typeof buttonVariants> & {
    rendered?: boolean;
    loading?: boolean;
  }) {
  const buttonPressEffect = useCell(settingsAtoms.buttonPressEffect);
  const isLoading = loading === true;

  if (!rendered) return null;

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
      disabled={disabled || isLoading}
      aria-busy={isLoading || undefined}
    >
      {isLoading ? <SmallLoader inheritSize className="size-[1em]" /> : children}
    </ButtonPrimitive>
  );
}

export { Button };
