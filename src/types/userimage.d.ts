import type { MouseEventHandler } from "react";

export interface UserImage {
  id: string;
  name: string;
  mimeType: string;
  url: string;
  originalUrl: string | null;
  version: string | null;
  createdAt: number;
}

export interface UserImageFile {
  id: string;
  name: string;
  mimeType: string;
  path: string;
  originalPath: string | null;
  version: string | null;
  createdAt: number;
}

export interface DitherImageMeta {
  id: string;
  name: string;
  mimeType: string;
  hasOriginal: boolean;
  createdAt: number;
}

export interface UserImagePickerProps {
  selected?: string;
  onSelect: (icon: string, image?: UserImage) => void;
}

export interface UserImageIconProps {
  icon: string;
  alt?: string;
  className?: string;
  fallback?: string;
  url?: string;
  onClick?: MouseEventHandler<HTMLImageElement>;
}
