import { cn } from "cn";

import type { QueuePlace } from "@/types/torrent/torrentQueue";

export default function DropLine({ place }: { place: QueuePlace | null }) {
  if (!place) return null;
  return (
    <span
      aria-hidden="true"
      className={cn(
        "bg-highlight pointer-events-none absolute inset-x-0 h-0.5",
        place === "before" ? "top-0" : "bottom-0"
      )}
    />
  );
}
