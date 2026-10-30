import type { ReactNode } from "react";

export function HeaderAction({
  title,
  onClick,
  icon,
}: {
  title: string;
  onClick: () => void;
  icon: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className="windows95-active-border bg-primary text-text windows95-text flex size-5 cursor-pointer items-center justify-center hover:brightness-110 active:translate-x-px active:translate-y-px"
    >
      {icon}
    </button>
  );
}
