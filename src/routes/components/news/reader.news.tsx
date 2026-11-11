import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { openUrl } from "@tauri-apps/plugin-opener";
import { attempt, reportBackgroundError } from "@hullperse/hp_utils/attempt";
import { Check, ExternalLink, Link2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import ContextMenu from "@/components/shared/contextMenu.component";
import { TrailerEmbed } from "@/components/shared/lightbox/trailerEmbed.media";
import { VkEmbed } from "@/components/shared/lightbox/vkEmbed.media";
import Modal from "@/components/shared/modal.component";
import Section from "@/components/shared/section.component";
import { Button } from "@/components/ui/button.component";
import ImageComponent from "@/components/ui/image.component";
import { useI18n } from "@/hooks/i18n.hook";
import { useImageMenuEntries } from "@/hooks/imageMenu.hook";
import { buildNewsLink } from "@/lib/core/system/deeplink.utils";
import { ignore } from "@/lib/core/shared/promise.utils";
import type { NewsAttachment, NewsItem } from "@/types/news/news";

import ContentNews from "@/routes/components/news/content.news";
import MediaNews from "@/routes/components/news/media.news";

type ReaderMode =
  | { kind: "post" }
  | { kind: "image"; images: readonly string[]; index: number }
  | { kind: "youtube"; youtubeId: string }
  | { kind: "vk"; url: string; pageUrl: string };

const imageUrl = (attachment: NewsAttachment): string =>
  attachment.fullUrl ?? attachment.previewUrl;

/** Reads a post inside the app; video and images replace the body the way the AniList trailer does. */
export default function ReaderNews({
  item,
  page,
  onClose,
}: {
  item: NewsItem;
  page: number;
  onClose: () => void;
}) {
  const { t, locale } = useI18n();
  const [mode, setMode] = useState<ReaderMode>({ kind: "post" });
  const [linkCopied, setLinkCopied] = useState<boolean>(false);
  const copyTimer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (copyTimer.current !== null) window.clearTimeout(copyTimer.current);
    },
    []
  );
  const copyLink = useCallback(() => {
    ignore(
      attempt(writeText(buildNewsLink(item.id, page))).then(([, error]) => {
        if (error !== null) reportBackgroundError("news.copy-link", error);
        return null;
      })
    );
    setLinkCopied(true);
    if (copyTimer.current !== null) window.clearTimeout(copyTimer.current);
    copyTimer.current = window.setTimeout(() => setLinkCopied(false), 1500);
  }, [item.id, page]);

  const stamp = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, { dateStyle: "long", timeStyle: "short" }).format(
        new Date(item.createdAt)
      ),
    [item.createdAt, locale]
  );
  const images = useMemo(
    () => item.attachments.filter((attachment) => attachment.kind === "image"),
    [item.attachments]
  );
  const imageUrls = useMemo(() => images.map(imageUrl), [images]);
  const viewerImage = mode.kind === "image" ? (mode.images.at(mode.index) ?? null) : null;
  const imageMenuEntries = useImageMenuEntries(viewerImage, true);
  const openExternal = useCallback((url: string): void => {
    ignore(
      attempt(openUrl(url)).then(([, error]) => {
        if (error !== null) reportBackgroundError("news.open-external", error);
        return null;
      })
    );
  }, []);
  const back = () => setMode({ kind: "post" });

  if (mode.kind === "image") {
    const step = (delta: number) => () =>
      setMode((prev) =>
        prev.kind !== "image"
          ? prev
          : {
              ...prev,
              index: (prev.index + delta + prev.images.length) % prev.images.length,
            }
      );
    const current = mode.images.at(mode.index) ?? "";
    return (
      <Modal
        header={t("news.images")}
        onClose={onClose}
        onBack={back}
        pager={
          mode.images.length > 1
            ? {
                index: mode.index,
                total: mode.images.length,
                label: t("news.images"),
                onPrevious: step(-1),
                onNext: step(1),
              }
            : undefined
        }
        className="w-[min(78rem,calc(100vw-1rem))]"
      >
        <ContextMenu entries={imageMenuEntries}>
          <div className="windows95-border h-[62vh] w-full overflow-auto bg-black/20">
            <ImageComponent
              key={current}
              src={current}
              alt=""
              className="h-full w-full"
              type="contain"
            />
          </div>
        </ContextMenu>
      </Modal>
    );
  }

  if (mode.kind === "youtube") {
    return (
      <Modal
        header={item.title}
        onClose={onClose}
        onBack={back}
        className="w-[min(56rem,calc(100vw-2rem))]"
      >
        <TrailerEmbed
          youtubeId={mode.youtubeId}
          title={item.title}
          className="aspect-video w-full"
        />
      </Modal>
    );
  }

  if (mode.kind === "vk") {
    return (
      <Modal
        header={item.title}
        onClose={onClose}
        onBack={back}
        className="w-[min(56rem,calc(100vw-2rem))]"
      >
        <VkEmbed embedUrl={mode.url} title={item.title} className="aspect-video w-full" />
        <div className="flex justify-end">
          <Button className="h-5 px-1 text-xs" onClick={() => openExternal(mode.pageUrl)}>
            {t("news.openVideo")}
          </Button>
        </div>
      </Modal>
    );
  }

  const cover = images.at(0);

  return (
    <Modal
      header={item.title}
      onClose={onClose}
      className="w-[min(64rem,calc(100vw-2rem))]"
      headerActions={
        <>
          <button
            type="button"
            className="windows95-active-border bg-primary text-text windows95-text flex size-5 cursor-pointer items-center justify-center hover:brightness-110 active:translate-x-px active:translate-y-px"
            title={linkCopied ? t("news.share.copied") : t("news.share")}
            aria-label={t("news.share")}
            onClick={copyLink}
          >
            {linkCopied ? <Check className="size-2.5" /> : <Link2 className="size-2.5" />}
          </button>
          <button
            type="button"
            className="windows95-active-border bg-primary text-text windows95-text flex size-5 cursor-pointer items-center justify-center hover:brightness-110 active:translate-x-px active:translate-y-px"
            title={t("news.openSite")}
            aria-label={t("news.openSite")}
            onClick={() => openExternal(item.siteUrl)}
          >
            <ExternalLink className="size-2.5" />
          </button>
        </>
      }
    >
      {cover && (
        <button
          type="button"
          className="windows95-border h-64 w-full cursor-zoom-in overflow-hidden bg-black"
          aria-label={t("news.openImage")}
          onClick={() => setMode({ kind: "image", images: imageUrls, index: 0 })}
        >
          <ImageComponent src={cover.previewUrl} alt="" className="h-full w-full" />
        </button>
      )}

      <div className="windows95-active-border bg-field w-full p-3">
        <div className="flex max-w-[76ch] flex-col gap-2">
          <h2 className="windows95-text text-text m-0 text-[15px] leading-snug font-bold">
            {item.title}
          </h2>
          <span className="windows95-text text-hint">{stamp}</span>
          <ContentNews blocks={item.blocks} onOpen={openExternal} />
        </div>
      </div>

      {item.attachments.length > 0 && (
        <Section header={t("news.attachments")}>
          <MediaNews
            attachments={item.attachments}
            onOpenImage={(urls, index) => setMode({ kind: "image", images: urls, index })}
            onPlayYoutube={(youtubeId) => setMode({ kind: "youtube", youtubeId })}
            onOpenVk={(url, pageUrl) => setMode({ kind: "vk", url, pageUrl })}
          />
        </Section>
      )}

    </Modal>
  );
}
