import { TRACK_STUDIOS } from "@/config/media/tokens.config";
import { canonicalLang, classifyMediaTokens } from "@/lib/media/classify.utils";
import { tokenizeMediaName } from "@/lib/media/tokenize.utils";
import type { MediaSidecar, MediaSidecarKind } from "@/types/media";

const STUDIO_SET = new Set(TRACK_STUDIOS.map((studio) => studio.toLowerCase()));

export function splitSidecarStem(stem: string): { base: string; suffix: string | null } {
  const match = /^(.*[)\]])\.(.+)$/.exec(stem);
  if (!match?.[1] || !match[2]) return { base: stem, suffix: null };
  return { base: match[1], suffix: match[2] };
}

export function parseSidecarSuffix(
  suffix: string | null,
  kind: MediaSidecarKind,
  dirLangs: string[]
): MediaSidecar {
  const sidecar: MediaSidecar = { kind, lang: [] };
  if (suffix && STUDIO_SET.has(suffix.toLowerCase())) {
    sidecar.studio = suffix;
    sidecar.lang = dirLangs;
    return sidecar;
  }
  if (!suffix) {
    sidecar.lang = dirLangs;
    return sidecar;
  }
  for (const token of classifyMediaTokens(tokenizeMediaName(suffix))) {
    if (token.kind === "studio") sidecar.studio = token.value;
    else if (token.kind === "service") sidecar.origin = token.value;
    else if (token.kind === "dub") sidecar.dub = true;
    else if (token.kind === "lang") {
      const lang = canonicalLang(token.value);
      if (lang && !sidecar.lang.includes(lang)) sidecar.lang.push(lang);
    } else if (token.kind === "title" || token.kind === "unknown") {
      sidecar.variant = sidecar.variant ? `${sidecar.variant} ${token.value}` : token.value;
    }
  }
  if (sidecar.lang.length === 0) sidecar.lang = dirLangs;
  return sidecar;
}
