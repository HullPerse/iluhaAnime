import type { NewsAttachment } from "@/types/news/news";

const YOUTUBE_EMBED =
  /^https?:\/\/(?:www\.)?(?:youtube\.com|youtube-nocookie\.com)\/embed\/([\w-]{6,})/;

/** Videos first, then images: a post that has a video leads with it. */
export function orderedAttachments(attachments: readonly NewsAttachment[]): NewsAttachment[] {
  const videos = attachments.filter((attachment) => attachment.kind !== "image");
  const images = attachments.filter((attachment) => attachment.kind === "image");
  return [...videos, ...images];
}

/** Extracts the video id from a YouTube embed URL so the inline player can use it. */
export function youtubeIdOf(embedUrl: string | undefined): string | null {
  if (!embedUrl) return null;
  return YOUTUBE_EMBED.exec(embedUrl)?.[1] ?? null;
}
