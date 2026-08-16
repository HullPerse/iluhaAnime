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

/** Create a small transferable thumbnail for LAN room discovery/handshake. */
export async function userImageThumbnail(
  dataUrl: string,
  maxSize = 96
): Promise<string> {
  if (dataUrl.length <= 220_000 || typeof window === "undefined")
    return dataUrl;
  return new Promise((resolve) => {
    const image = new window.Image();
    image.onload = () => {
      const scale = Math.min(
        1,
        maxSize / Math.max(image.naturalWidth, image.naturalHeight)
      );
      const width = Math.max(1, Math.round(image.naturalWidth * scale));
      const height = Math.max(1, Math.round(image.naturalHeight * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) {
        resolve(dataUrl);
        return;
      }
      context.drawImage(image, 0, 0, width, height);
      resolve(canvas.toDataURL("image/webp", 0.82));
    };
    image.onerror = () => resolve(dataUrl);
    image.src = dataUrl;
  });
}
