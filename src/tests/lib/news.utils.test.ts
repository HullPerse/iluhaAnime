import { describe, expect, it } from "vitest";

import { orderedAttachments, youtubeIdOf } from "@/lib/news/media.utils";
import { excerptOf } from "@/lib/news/text.utils";
import type { NewsAttachment, NewsBlock } from "@/types/news/news";

describe("youtubeIdOf", () => {
  it("reads the id from a youtube embed url", () => {
    expect(youtubeIdOf("https://www.youtube.com/embed/U-M6dQImHrI")).toBe("U-M6dQImHrI");
    expect(youtubeIdOf("https://youtube.com/embed/abc-DEF_123")).toBe("abc-DEF_123");
  });

  it("rejects vk embeds and malformed urls", () => {
    expect(youtubeIdOf("https://vkvideo.ru/video_ext.php?oid=-1&id=2")).toBeNull();
    expect(youtubeIdOf("https://www.youtube.com/watch?v=U-M6dQImHrI")).toBeNull();
    expect(youtubeIdOf(undefined)).toBeNull();
  });
});

describe("orderedAttachments", () => {
  const image: NewsAttachment = { kind: "image", previewUrl: "p", fullUrl: "f" };
  const youtube: NewsAttachment = { kind: "youtube", previewUrl: "p", embedUrl: "e" };
  const vk: NewsAttachment = { kind: "vk", previewUrl: "p", pageUrl: "u" };

  it("moves videos ahead of images and keeps their order", () => {
    expect(orderedAttachments([image, youtube, image, vk]).map((a) => a.kind)).toEqual([
      "youtube",
      "vk",
      "image",
      "image",
    ]);
  });

  it("keeps images untouched", () => {
    expect(orderedAttachments([image, image]).map((a) => a.kind)).toEqual(["image", "image"]);
  });
});

describe("excerptOf", () => {
  const blocks: NewsBlock[] = [
    { kind: "paragraph", runs: [{ text: "Первый " }, { text: "абзац", bold: true }] },
    { kind: "quote", runs: [{ text: "цитата" }] },
  ];

  it("joins runs and blocks into one line", () => {
    expect(excerptOf(blocks)).toBe("Первый абзац цитата");
  });

  it("truncates long text with an ellipsis", () => {
    expect(excerptOf(blocks, 6)).toBe("Первый...");
  });
});
