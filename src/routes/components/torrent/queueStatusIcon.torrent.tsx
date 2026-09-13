import { ListVideo } from "lucide-react";

import { SmallLoader } from "@/components/shared/loader.component";

export function QueueStatusIcon({ status }: { status: string | undefined }) {
  if (status === "queued") return <ListVideo className="text-hint size-3" />;
  if (status === "processing") return <SmallLoader size={3} className="text-highlight" />;
  return null;
}
