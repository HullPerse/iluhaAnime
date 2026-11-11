import { Play } from "lucide-react";

import ImageComponent from "@/components/ui/image.component";
import { orderedAttachments } from "@/lib/news/media.utils";
import type { NewsAttachment } from "@/types/news/news";

const MAX_TILES = 3;
const THUMB = "aspect-video w-24";

/** Attachment preview: three 16:9 slots at most, video first, with the calendar-style +N chip. */
export default function StripNews({
  attachments,
  onOpen,
  moreLabel,
}: {
  attachments: readonly NewsAttachment[];
  onOpen: () => void;
  moreLabel: (count: number) => string;
}) {
  if (attachments.length === 0) return null;
  const ordered = orderedAttachments(attachments);
  const visible = ordered.slice(0, MAX_TILES);
  const hidden = ordered.length - visible.length;

  return (
    <div className="flex flex-nowrap items-start gap-1 overflow-hidden">
      {visible.map((attachment, index) => (
        <span
          key={index}
          className="windows95-border relative block shrink-0 overflow-hidden bg-black p-0.5"
        >
          <ImageComponent src={attachment.previewUrl} alt="" className={THUMB} />
          {attachment.kind !== "image" && (
            <>
              <span className="windows95-active-border bg-primary absolute top-1/2 left-1/2 flex size-4 -translate-x-1/2 -translate-y-1/2 items-center justify-center">
                <Play aria-hidden className="size-2" />
              </span>
              <span className="bg-secondary text-title-text windows95-text absolute right-0 bottom-0 px-0.5 font-bold">
                {attachment.kind === "vk" ? "VK" : "YT"}
              </span>
            </>
          )}
        </span>
      ))}
      {hidden > 0 && (
        <button
          type="button"
          className="border-muted bg-secondary text-title-text windows95-text hover:bg-secondary/80 flex h-4 min-w-4 shrink-0 cursor-pointer items-center justify-center border px-0.5 leading-none"
          title={moreLabel(hidden)}
          aria-label={moreLabel(hidden)}
          onClick={onOpen}
        >
          +{hidden}
        </button>
      )}
    </div>
  );
}
