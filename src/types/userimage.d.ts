export interface UserImage {
  id: string;
  name: string;
  mimeType: string;
  url: string;
  originalUrl: string | null;
  version: string | null;
  createdAt: number;
  source?: string | null;
}

export interface UserImageFile {
  id: string;
  name: string;
  mimeType: string;
  path: string;
  originalPath: string | null;
  version: string | null;
  createdAt: number;
  source?: string | null;
}

export interface DitherImageMeta {
  id: string;
  name: string;
  mimeType: string;
  hasOriginal: boolean;
  createdAt: number;
}
