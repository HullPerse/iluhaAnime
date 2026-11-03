import { attempt } from "@hullperse/hp_utils/attempt";

const POSTER_COPY_URL_RE = /^https?:\/\/(?!asset\.localhost)/i;

export const canCopyPosterUrl = (poster: string): boolean => {
  return POSTER_COPY_URL_RE.test(poster);
};

export const posterPngBlob = async (src: string): Promise<Blob> => {
  const response = await fetch(src);
  if (!response.ok) throw new Error(`poster fetch failed: ${response.status}`);
  const bitmap = await createImageBitmap(await response.blob());
  const [encoded, error] = await attempt(
    (async () => {
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("no 2d canvas context");
      context.drawImage(bitmap, 0, 0);
      const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!png) throw new Error("png encode failed");
      return png;
    })()
  );
  bitmap.close();
  if (error !== null) throw error;
  if (encoded === null) throw new Error("png encode failed");
  return encoded;
};
