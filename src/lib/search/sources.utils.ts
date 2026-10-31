import type { StreamSource, StreamVariantSource } from "@/types/player/videoPlayer";

export function qualityRank(label: string): number {
  const digits = label.replace(/\D/g, "");
  return digits.length > 0 ? Number(digits) : 0;
}

export function sortSourcesByQuality(sources: StreamSource[]): StreamSource[] {
  return [...sources].sort((left, right) => qualityRank(right.label) - qualityRank(left.label));
}

export function pickSource(sources: StreamSource[], preferred?: string): StreamSource | null {
  if (sources.length === 0) return null;
  const sorted = sortSourcesByQuality(sources);
  if (!preferred) return sorted[0];
  const exact = sorted.find((source) => source.label === preferred);
  if (exact) return exact;
  const preferredRank = qualityRank(preferred);
  if (preferredRank <= 0) return sorted[0];
  const lower = sorted.find((source) => {
    const rank = qualityRank(source.label);
    return rank > 0 && rank <= preferredRank;
  });
  return lower ?? sorted.at(-1) ?? null;
}

export function toVariantSources(sources: StreamSource[]): StreamVariantSource[] {
  return sortSourcesByQuality(sources).map((source) => ({
    url: source.url,
    type: source.type,
    quality: source.quality,
    label: source.label,
  }));
}

export function variantSourceUrl(sources: StreamVariantSource[], label: string): string | null {
  return sources.find((source) => source.label === label)?.url ?? null;
}
