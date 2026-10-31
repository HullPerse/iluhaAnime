export function parseUpscaleFps(fpsValue: string): number | null {
  if (fpsValue === "60" || fpsValue === "60i") return 60;
  if (!fpsValue) return null;
  return Number(fpsValue);
}
