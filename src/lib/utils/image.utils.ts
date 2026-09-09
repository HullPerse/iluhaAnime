import { convertFileSrc } from "@tauri-apps/api/core";

import type { UserImage, UserImageFile } from "@/types";

export const USER_IMAGE_PREFIX = "user-image:";

export function userImageIcon(id: string): string {
  return `${USER_IMAGE_PREFIX}${id}`;
}

export function isUserImageIcon(value: string): boolean {
  return value.startsWith(USER_IMAGE_PREFIX);
}

export function userImageId(value: string): string | null {
  if (!isUserImageIcon(value)) return null;
  const id = value.slice(USER_IMAGE_PREFIX.length).trim();
  return id || null;
}

/** Asset-protocol URL for a stored user image file (streamed from disk, no IPC bytes). */
export function assetUrl(path: string): string {
  return convertFileSrc(path);
}

export function toUserImage(raw: UserImageFile): UserImage {
  return {
    id: raw.id,
    name: raw.name,
    mimeType: raw.mimeType,
    url: assetUrl(raw.path),
    originalUrl: raw.originalPath === null ? null : assetUrl(raw.originalPath),
    createdAt: raw.createdAt,
  };
}

/** Covers that are usable as an <img> src without the download path. */
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
