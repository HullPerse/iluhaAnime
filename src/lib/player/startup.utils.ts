export function recordPlayerControlsReady(ready: boolean): void {
  performance.clearMarks?.("player:controls-ready");

  if (ready) performance.mark?.("player:controls-ready");
}

export async function measurePlayerStartup<T>(
  phase:
    | "native-init"
    | "settings"
    | "profile"
    | "pending-request"
    | "local-load-submit"
    | "watch-state"
    | "file-state"
    | "sidecars"
    | "tracks",
  run: () => Promise<T>,
  isCurrent: () => boolean = () => true
): Promise<T> {
  const start = performance.now();
  let status = "failed";

  try {
    const result = await run();
    status = "complete";

    return result;
  } finally {
    if (isCurrent() && typeof performance.measure === "function") {
      const name = `player:${phase}`;
      performance.clearMeasures(name);
      performance.measure(name, { start, end: performance.now(), detail: { status } });
    }
  }
}
