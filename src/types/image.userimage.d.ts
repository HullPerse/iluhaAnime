export interface UserImage {
  id: string;
  name: string;
  mimeType: string;
  url: string;
  originalUrl: string | null;
  ditherOptions: string | null;
  createdAt: number;
}

export interface UserImageFile {
  id: string;
  name: string;
  mimeType: string;
  path: string;
  originalPath: string | null;
  ditherOptions: string | null;
  createdAt: number;
}

export interface DitherImageMeta {
  id: string;
  name: string;
  mimeType: string;
  hasOriginal: boolean;
  createdAt: number;
}
