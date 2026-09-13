import { Menu as MenuPrimitive } from "@base-ui/react/menu";
import { cn } from "cn";

export function DropdownMenuSeparator({ className, ...props }: MenuPrimitive.Separator.Props) {
  return (
    <MenuPrimitive.Separator
      data-slot="dropdown-menu-separator"
      className={cn("bg-secondary mx-1 my-1 h-px", className)}
      {...props}
    />
  );
}
