import type { ReactNode } from "react";

import { Button } from "@/components/ui/button.component";

export function SummaryButton({
  label,
  title,
  icon,
  onClick,
  busy,
}: {
  label: string;
  title?: string;
  icon?: ReactNode;
  onClick?: () => void;
  busy?: boolean;
}) {
  return (
    <Button
      className="h-5 w-full justify-start px-1 text-xs"
      title={title ?? label}
      aria-label={label}
      onClick={onClick}
      loading={busy}
    >
      {icon}
      {label}
    </Button>
  );
}
