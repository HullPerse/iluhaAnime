export type NewsBlockKind = "paragraph" | "quote";

export type NewsAttachmentKind = "image" | "youtube" | "vk";

/** Inline run of article text; only bold, italic and http(s) links survive normalization. */
export interface NewsRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  href?: string;
}

/** One article block. Quote blocks come from the source's blockquote markup. */
export interface NewsBlock {
  kind: NewsBlockKind;
  runs: NewsRun[];
}

/** One feed page. `hasMore` comes from the extra row the API returns beyond the limit. */
export interface NewsPage {
  items: NewsItem[];
  page: number;
  hasMore: boolean;
}

/** Attached media. Images carry preview and full size, videos carry preview, embed and page URLs. */
export interface NewsAttachment {
  kind: NewsAttachmentKind;
  previewUrl: string;
  fullUrl?: string;
  embedUrl?: string;
  pageUrl?: string;
}

/** Normalized news post: text and attachments only, no author or counters. */
export interface NewsItem {
  id: number;
  title: string;
  createdAt: string;
  siteUrl: string;
  blocks: NewsBlock[];
  attachments: NewsAttachment[];
}
