import { invokeTyped } from "@/lib/core/system/invoke.utils";

/**
 * Startup marks for the webview half of the boot timeline.
 *
 * The native side cannot see first paint, so the shell records its own phases
 * and reports them once, after the first screen is interactive. Values are
 * relative to the webview performance origin, matching `performance.now()`.
 */

interface StartupMark {
  label: string;
  ms: number;
}

const marks: StartupMark[] = [];
let reported = false;

export function markStartup(label: string): void {
  if (typeof performance === "undefined") return;
  marks.push({ label, ms: Math.round(performance.now() * 10) / 10 });
}

function startupMarks(): StartupMark[] {
  return [...marks];
}

export function reportStartup(): void {
  if (reported) return;
  reported = true;
  invokeTyped("report_startup", { marks: startupMarks() }).catch(() => undefined);
}
