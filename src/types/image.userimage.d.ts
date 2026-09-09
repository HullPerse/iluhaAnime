export interface UserImage {
  id: string;
  name: string;
  mimeType: string;
  url: string;
  originalUrl: string | null;
  createdAt: number;
}

/** Wire shape returned by the Rust commands: absolute file path, no bytes. */
export interface UserImageFile {
  id: string;
  name: string;
  mimeType: string;
  path: string;
  originalPath: string | null;
  createdAt: number;
}

export interface DitherImageMeta {
  id: string;
  name: string;
  mimeType: string;
  hasOriginal: boolean;
  createdAt: number;
}
