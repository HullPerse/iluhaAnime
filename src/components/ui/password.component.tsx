import { cn } from "cn";
import { Eye, EyeOff } from "lucide-react";
import * as React from "react";

import { useI18n } from "@/lib/locale/i18n.utils";

import { Input } from "./input.component";

interface PasswordInputProps extends Omit<React.ComponentProps<"input">, "type"> {
  wrapperClassName?: string;
}

function PasswordInput({ className, wrapperClassName, ...props }: PasswordInputProps) {
  const { t } = useI18n();
  const [visible, setVisible] = React.useState(false);

  return (
    <div
      className={cn(
        "windows95-border has-[input:focus-visible]:outline-text relative flex min-h-(--ui-control-height) w-full items-center bg-white has-[input:focus-visible]:outline-1 has-[input:focus-visible]:outline-offset-[-3px] has-[input:focus-visible]:outline-dotted",
        wrapperClassName
      )}
    >
      <Input
        type={visible ? "text" : "password"}
        className={cn(
          "h-full min-w-0 flex-1 border-0 bg-transparent px-1.5 pr-7 shadow-none focus-visible:ring-0 focus-visible:outline-none",
          className
        )}
        {...props}
      />
      <button
        type="button"
        aria-label={visible ? t("common.hide.password") : t("common.show.password")}
        title={visible ? t("common.hide.password") : t("common.show.password")}
        onClick={() => setVisible((prev) => !prev)}
        className="text-hint windows95-text hover:text-text focus-visible:outline-text absolute inset-y-0 right-0 flex w-7 items-center justify-center hover:cursor-pointer focus-visible:outline-1 focus-visible:outline-offset-[-3px] focus-visible:outline-dotted active:translate-x-px active:translate-y-px"
      >
        {visible ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
      </button>
    </div>
  );
}

export { PasswordInput };
