const EXTRA_MARKERS = ["_upscaled", "_converted"] as const;

export function isExtraFile(path: string): boolean {
  const name = path.replaceAll("\\", "/").split("/").pop()?.toLowerCase() ?? "";
  return EXTRA_MARKERS.some((marker) => name.includes(marker));
}
