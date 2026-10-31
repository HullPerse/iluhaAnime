export const PROXY_PRESETS = [
  "socks5://127.0.0.1:10808",
  "socks5://127.0.0.1:1080",
  "socks5h://127.0.0.1:10808",
  "http://127.0.0.1:7890",
  "http://127.0.0.1:10809",
  "http://127.0.0.1:8080",
] as const;

export function proxySelectValue(proxy: string | null): string {
  const value = proxy?.trim() ?? "";
  if (!value) return "";
  return (PROXY_PRESETS as readonly string[]).includes(value) ? value : "custom";
}
