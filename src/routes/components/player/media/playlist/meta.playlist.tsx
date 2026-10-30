import { cn } from "cn";

export function PlaylistCardMeta({ meta, current }: { meta: string; current: boolean }) {
  if (!meta) return null;
  return (
    <span className={cn("text-xs tabular-nums", current ? "text-primary/80" : "text-hint")}>
      {meta}
    </span>
  );
}
