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

const IMAGE_URL_RE =
  /^(https?:\/\/\S+\.(?:png|jpe?g|gif|webp|avif|bmp|svg)(?:\?\S*)?|\/\/\S+\.(?:png|jpe?g|gif|webp|avif|bmp|svg)(?:\?\S*)?|data:image\/[a-zA-Z.+-]+;base64,[A-Za-z0-9+/=]+)$/i;

export function isImageUrl(value: unknown): value is string {
  return typeof value === "string" && IMAGE_URL_RE.test(value);
}
