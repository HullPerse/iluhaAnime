import { Menu as MenuPrimitive } from "@base-ui/react/menu";
import { cn } from "cn";

export function DropdownMenuItem({
  className,
  inset,
  variant = "default",
  ...props
}: MenuPrimitive.Item.Props & {
  inset?: boolean;
  variant?: "default" | "destructive";
}) {
  return (
    <MenuPrimitive.Item
      data-slot="dropdown-menu-item"
      data-inset={inset}
      data-variant={variant}
      className={cn(
        "windows95-text windows95-border text-text data-highlighted:bg-highlight data-[variant=destructive]:text-destructive data-[variant=destructive]:data-highlighted:bg-destructive relative flex cursor-pointer items-center gap-1.5 px-1.5 py-1 text-sm outline-none select-none data-disabled:pointer-events-none data-disabled:opacity-50 data-highlighted:text-white data-inset:pl-7 data-[variant=destructive]:data-highlighted:text-white [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    />
  );
}
