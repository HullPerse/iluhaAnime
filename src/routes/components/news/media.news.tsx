import { Play } from "lucide-react";

import ImageComponent from "@/components/ui/image.component";
import { useI18n } from "@/hooks/i18n.hook";
import { youtubeIdOf } from "@/lib/news/media.utils";
import type { NewsAttachment } from "@/types/news/news";

/** Full-size media inside the reader: images open the viewer, YouTube plays inline, VK opens on site. */
export default function MediaNews({
  attachments,
  onOpenImage,
  onPlayYoutube,
  onOpenVk,
}: {
  attachments: readonly NewsAttachment[];
  onOpenImage: (urls: readonly string[], index: number) => void;
  onPlayYoutube: (youtubeId: string) => void;
  onOpenVk: (embedUrl: string, pageUrl: string) => void;
}) {
  const { t } = useI18n();
  const images = attachments.filter((attachment) => attachment.kind === "image");
  const imageUrl = (attachment: NewsAttachment): string =>
    attachment.fullUrl ?? attachment.previewUrl;

  if (attachments.length === 0) return null;

  return (
    <div className="flex flex-wrap items-start gap-2">
      {attachments.map((attachment, index) => {
        if (attachment.kind === "image") {
          return (
            <button
              key={index}
              type="button"
              className="windows95-border relative block aspect-video w-40 shrink-0 cursor-zoom-in overflow-hidden bg-black/20 p-0.5 hover:brightness-110"
              title={t("news.openImage")}
              aria-label={t("news.openImage")}
              onClick={() => onOpenImage(images.map(imageUrl), images.indexOf(attachment))}
            >
              <ImageComponent src={attachment.previewUrl} alt="" className="h-full w-full" />
            </button>
          );
        }

        const isVk = attachment.kind === "vk";
        const youtubeId = attachment.kind === "youtube" ? youtubeIdOf(attachment.embedUrl) : null;
        const target = attachment.embedUrl ?? attachment.pageUrl ?? attachment.previewUrl;
        return (
          <button
            key={index}
            type="button"
            className="windows95-border relative block aspect-video w-40 shrink-0 cursor-pointer overflow-hidden bg-black p-0.5 hover:brightness-110"
            title={isVk ? t("news.playVk") : t("news.playVideo")}
            aria-label={isVk ? t("news.playVk") : t("news.playVideo")}
            onClick={() =>
              isVk
                ? onOpenVk(target, attachment.pageUrl ?? target)
                : youtubeId !== null && onPlayYoutube(youtubeId)
            }
          >
            <ImageComponent src={attachment.previewUrl} alt="" className="h-full w-full" />
            <span className="windows95-active-border bg-primary absolute top-1/2 left-1/2 flex size-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center">
              <Play aria-hidden className="size-3" />
            </span>
            <span className="bg-secondary text-title-text windows95-text absolute bottom-0.5 left-0.5 px-1 font-bold">
              {attachment.kind === "vk" ? "VK" : "YouTube"}
            </span>
          </button>
        );
      })}
    </div>
  );
}
