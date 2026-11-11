import { useMemo } from "react";

import ImageComponent from "@/components/ui/image.component";
import { useI18n } from "@/hooks/i18n.hook";
import { excerptOf } from "@/lib/news/text.utils";
import type { NewsItem } from "@/types/news/news";

import StripNews from "@/routes/components/news/strip.news";

/** Magazine tile: 16:9 cover, title, date, excerpt and a capped attachment strip. */
export default function CardNews({
  item,
  onOpen,
}: {
  item: NewsItem;
  onOpen: (item: NewsItem) => void;
}) {
  const { t, locale } = useI18n();
  const stamp = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(item.createdAt)),
    [item.createdAt, locale]
  );
  const excerpt = useMemo(() => excerptOf(item.blocks, 240), [item.blocks]);

  const getCover = () => {
    const type = item.attachments.find((attachment) => attachment.kind);

    if (!type) return undefined;
    return type.previewUrl;
  };

  // const cover = item.attachments.find((attachment) => attachment.kind === "image");
  const cover = getCover();

  return (
    <article className="windows95-border bg-field flex min-w-0 flex-col">
      {cover && (
        <button
          type="button"
          className="border-muted aspect-video w-full cursor-pointer overflow-hidden border-b bg-black"
          aria-label={t("news.open")}
          onClick={() => onOpen(item)}
        >
          <ImageComponent src={cover} alt="" className="h-full w-full" />
        </button>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 p-2">
        <button
          type="button"
          className="windows95-text text-text hover:text-highlight line-clamp-2 cursor-pointer text-left text-[13px] leading-tight font-bold hover:underline"
          title={item.title}
          onClick={() => onOpen(item)}
        >
          {item.title}
        </button>
        <div className="windows95-text text-hint">{stamp}</div>
        <button
          type="button"
          className="windows95-text text-text hover:text-highlight line-clamp-4 cursor-pointer text-left leading-relaxed"
          onClick={() => onOpen(item)}
        >
          {excerpt}
        </button>
        <div className="flex-1" />
        <StripNews
          attachments={item.attachments}
          onOpen={() => onOpen(item)}
          moreLabel={(count) => t("news.more.attachments", { count })}
        />
      </div>
    </article>
  );
}
