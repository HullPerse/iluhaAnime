import { convertFileSrc } from "@tauri-apps/api/core";

import type { UserImage, UserImageFile } from "@/types/core/userimage";

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
