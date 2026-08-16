import { Eye, EyeOff } from "lucide-react";
import * as React from "react";

import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/index.utils";

import { Input } from "./input.component";

interface PasswordInputProps extends Omit<
  React.ComponentProps<"input">,
  "type"
> {
  wrapperClassName?: string;
}

function PasswordInput({
  className,
  wrapperClassName,
  ...props
}: PasswordInputProps) {
  const { t } = useI18n();
  const [visible, setVisible] = React.useState(false);

  return (
    <div className={cn("relative", wrapperClassName)}>
      <Input
        type={visible ? "text" : "password"}
        className={cn("pr-6", className)}
        {...props}
      />
      <button
        type="button"
        aria-label={
          visible ? t("common.hidePassword") : t("common.showPassword")
        }
        title={visible ? t("common.hidePassword") : t("common.showPassword")}
        onClick={() => setVisible((prev) => !prev)}
        className="text-muted windows95-text hover:text-text focus-visible:outline-text absolute inset-y-0 right-0 flex w-6 items-center justify-center hover:cursor-pointer focus-visible:outline-1 focus-visible:outline-offset-[-3px] focus-visible:outline-dotted active:translate-x-px active:translate-y-px"
      >
        {visible ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
      </button>
    </div>
  );
}

export { PasswordInput };
