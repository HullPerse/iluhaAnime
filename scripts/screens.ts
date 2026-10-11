/**
 * Renders the fullscreen system screens (fatal BSOD, database gate, startup
 * splash) in a real browser and saves one PNG per case for human review.
 *
 * There is no pixel diff on purpose: fonts and GPU raster differ between
 * machines, so automated comparison would flake. The script only guarantees
 * every screen renders without throwing; the pictures are eyeballed.
 *
 * Usage:
 *   bun run dev              # the dev server must answer on 127.0.0.1:1420
 *   bun run screens          # writes src-tauri/target-screens/out/<stamp>/
 *
 * Outputs:
 *   src-tauri/target-screens/out/<stamp>/fatal-<theme>-<kind>.png
 *   src-tauri/target-screens/out/<stamp>/db-<theme>.png
 *   src-tauri/target-screens/out/<stamp>/splash-<theme>.png
 */
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { chromium } from "playwright-core";

const DEV_URL = "http://127.0.0.1:1420/screens.html";
const OUT_ROOT = join("src-tauri", "target-screens", "out");

interface ScreenCase {
  file: string;
  query: string;
  role: "alert" | "status";
}

const CASES: ScreenCase[] = [
  { file: "fatal-win95-chunk", query: "screen=fatal&theme=win95&kind=chunk", role: "alert" },
  { file: "fatal-xp-chunk", query: "screen=fatal&theme=xp&kind=chunk", role: "alert" },
  { file: "fatal-win7-render", query: "screen=fatal&theme=win7&kind=render", role: "alert" },
  {
    file: "fatal-generic-gruvbox-dark-startup",
    query: "screen=fatal&theme=gruvbox-dark&kind=startup",
    role: "alert",
  },
  {
    file: "fatal-generic-terminal-global-loop",
    query: "screen=fatal&theme=terminal&kind=global-loop",
    role: "alert",
  },
  {
    file: "fatal-generic-anilist-render",
    query: "screen=fatal&theme=anilist&kind=render",
    role: "alert",
  },
  { file: "db-win95", query: "screen=db&theme=win95", role: "alert" },
  { file: "db-generic-gruvbox-dark", query: "screen=db&theme=gruvbox-dark", role: "alert" },
  { file: "splash-win95", query: "screen=splash&theme=win95", role: "status" },
  { file: "splash-generic-terminal", query: "screen=splash&theme=terminal", role: "status" },
];

/** Build scripts report progress; oxlint only tolerates warn and error on the console. */
function log(message: string) {
  process.stdout.write(`${message}\n`);
}

const stamp = new Date().toISOString().replaceAll(/[:.]/gu, "-");
const outDir = join(OUT_ROOT, stamp);
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  for (const item of CASES) {
    await page.goto(`${DEV_URL}?${item.query}`, { waitUntil: "networkidle" });
    await page.getByRole(item.role).waitFor({ timeout: 15000 });
    await page.screenshot({ path: join(outDir, `${item.file}.png`) });
    log(`saved ${item.file}.png`);
  }
} finally {
  await browser.close();
}
log(`done: ${outDir}`);
