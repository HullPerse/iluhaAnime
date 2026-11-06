import { proxyScheme, type ProxyScheme } from "@/lib/core/system/proxy.utils";

const PROXY_PRESETS = [
  "socks5://127.0.0.1:10808",
  "socks5://127.0.0.1:1080",
  "socks5h://127.0.0.1:10808",
  "http://127.0.0.1:7890",
  "http://127.0.0.1:10809",
  "http://127.0.0.1:8080",
] as const;

export function proxyPresetsFor(schemes?: readonly ProxyScheme[]): string[] {
  if (schemes === undefined) return [...PROXY_PRESETS];
  return PROXY_PRESETS.filter((url) => {
    const scheme = proxyScheme(url);
    return scheme !== null && schemes.includes(scheme);
  });
}

export function proxySelectValue(proxy: string | null, schemes?: readonly ProxyScheme[]): string {
  const value = proxy?.trim() ?? "";
  if (!value) return "";
  return proxyPresetsFor(schemes).includes(value) ? value : "custom";
}
