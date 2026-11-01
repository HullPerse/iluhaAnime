export function isValidProxyUrl(value: string | null): boolean {
  if (value === null || value.trim().length === 0) return true;
  return /^(socks5h?|https?):\/\/\S+$/u.test(value.trim());
}
