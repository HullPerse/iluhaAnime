import { convertFileSrc } from "@tauri-apps/api/core";

import type { UserImage, UserImageFile } from "@/types/userimage";

export const USER_IMAGE_PREFIX = "user-image:";

export function isUserImageIcon(value: string): boolean {
  return value.startsWith(USER_IMAGE_PREFIX);
}

export function assetUrl(path: string, version?: string | null): string {
  const url = convertFileSrc(path);
  if (version === undefined || version === null || version === "") return url;
  return `${url}${url.includes("?") ? "&" : "?"}v=${encodeURIComponent(version)}`;
}

export function toUserImage(raw: UserImageFile): UserImage {
  return {
    id: raw.id,
    name: raw.name,
    mimeType: raw.mimeType,
    url: assetUrl(raw.path, raw.version),
    originalUrl: raw.originalPath === null ? null : assetUrl(raw.originalPath),
    version: raw.version,
    createdAt: raw.createdAt,
    source: raw.source ?? null,
  };
}

export function isDirectImageSrc(value: string): boolean {
  return (
    value.startsWith("data:") ||
    value.startsWith("/") ||
    value.startsWith("asset:") ||
    value.startsWith("http://asset.localhost/")
  );
}

const IMAGE_URL_RE =
  /^(https?:\/\/\S+\.(?:png|jpe?g|gif|webp|avif|bmp|svg)(?:\?\S*)?|\/\/\S+\.(?:png|jpe?g|gif|webp|avif|bmp|svg)(?:\?\S*)?|data:image\/[a-zA-Z.+-]+;base64,[A-Za-z0-9+/=]+)$/i;

export function isImageUrl(value: unknown): value is string {
  return typeof value === "string" && IMAGE_URL_RE.test(value);
}
