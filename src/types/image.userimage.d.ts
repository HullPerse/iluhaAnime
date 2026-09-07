export interface UserImage {
  id: string;
  name: string;
  mimeType: string;
  dataUrl: string;
  originalSrc: string | null;
  createdAt: number;
}

export interface DitherImageMeta {
  id: string;
  name: string;
  mimeType: string;
  hasOriginal: boolean;
  createdAt: number;
}
