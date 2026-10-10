// Minimal CDP client for the live E2E harness. The app is a Tauri app, so
// it cannot be driven by pointing a normal browser at the Vite dev server:
// the Tauri IPC runtime only exists inside its own WebView2. We expose CDP
// on that WebView2 with WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS and connect
// with playwright-core (no browser download, connectOverCDP only).

import { chromium, type Browser, type Page } from "playwright-core";

// Parallel runs are possible (a second harness, a Chromium someone started with
// remote debugging), so the port is configurable instead of hard-wired. Default
// stays 9222 because that is what WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS carries.
export const DEFAULT_CDP_PORT = 9222;

export function cdpPort(): number {
  const raw = process.env.E2E_CDP_PORT;
  if (!raw) return DEFAULT_CDP_PORT;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65_535) {
    throw new Error(`E2E_CDP_PORT must be a TCP port, got "${raw}"`);
  }
  return parsed;
}

export const E2E_IDENTIFIER = "iluhaAnime.e2e";
export const READY_SELECTOR = '[role="tab"]';

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface ConsoleCollector {
  errors: string[];
  attach: (page: Page) => void;
}

export function createConsoleCollector(): ConsoleCollector {
  const errors: string[] = [];
  return {
    errors,
    attach(page: Page): void {
      page.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text());
      });
      page.on("pageerror", (error) => {
        errors.push(`pageerror: ${error.message}`);
      });
    },
  };
}

// The app cannot answer before `tauri dev` finishes its cargo build, and a
// rebuild triggered by a file change restarts it mid-run, so the window has to
// cover a full compile rather than a warm start. Progress is logged so a long
// wait reads as building instead of hanging.
export async function connectCdp(waitMs = 900_000): Promise<Browser> {
  const port = cdpPort();
  const started = Date.now();
  let lastError: unknown;
  let announced = 0;
  while (Date.now() - started < waitMs) {
    try {
      return await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
    } catch (error) {
      lastError = error;
      const elapsed = Date.now() - started;
      if (elapsed - announced >= 30_000) {
        announced = elapsed;
        console.log(`[e2e] waiting for the app on port ${port} (${Math.round(elapsed / 1000)}s)`);
      }
      await sleep(1000);
    }
  }
  throw new Error(`CDP connect failed on port ${port} after ${waitMs}ms: ${String(lastError)}`);
}

export async function findPage(
  browser: Browser,
  predicate: (url: string) => boolean,
  timeoutMs = 30_000
): Promise<Page> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    for (const context of browser.contexts()) {
      for (const page of context.pages()) {
        if (predicate(page.url())) return page;
      }
    }
    await sleep(300);
  }
  const seen = browser
    .contexts()
    .flatMap((context) => context.pages())
    .map((page) => page.url())
    .join(", ");
  throw new Error(`page not found within ${timeoutMs}ms; open pages: ${seen}`);
}

export async function mainPage(browser: Browser, timeoutMs?: number): Promise<Page> {
  return findPage(browser, (url) => url.includes(MAIN_URL), timeoutMs);
}

// The player is a separate Tauri window on its own route, so it is a distinct
// page reachable over the same CDP endpoint.
export async function findPlayerPage(browser: Browser, timeoutMs = 40_000): Promise<Page> {
  return findPage(browser, (url) => url.includes(PLAYER_URL), timeoutMs);
}

// Retries a command while the app-data write lock is held, which is the normal
// state right after boot (search index rebuild, folder scans).
export async function invokeRetryOnBusy<T>(
  page: Page,
  command: string,
  args: Record<string, unknown> | undefined,
  attempts = 12
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await invoke<T>(page, command, args);
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      if (!/busy|locked/i.test(message)) throw error;
      await sleep(1000);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
// Page text is the cheapest way to see what the app is actually showing when
// an assertion fails inside a second window.
export async function visibleText(page: Page, maxLength = 400): Promise<string> {
  const text =
    (await page
      .locator("body")
      .textContent()
      .catch(() => "")) ?? "";
  return text.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

// Calls a Tauri command from inside the real WebView. This is the seeding
// primitive: the harness drives the actual backend, not a mock.
export async function invoke<T>(
  page: Page,
  command: string,
  args?: Record<string, unknown>
): Promise<T> {
  return page.evaluate(
    async (input: { command: string; args?: Record<string, unknown> }) => {
      const internals = (
        window as unknown as {
          __TAURI_INTERNALS__?: { invoke: (cmd: string, args?: unknown) => Promise<unknown> };
        }
      ).__TAURI_INTERNALS__;
      if (!internals) throw new Error("Tauri runtime not present in page");
      return (await internals.invoke(input.command, input.args)) as unknown;
    },
    { command, args }
  ) as Promise<T>;
}

export async function waitForReady(page: Page, timeoutMs = 120_000): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if ((await page.locator(READY_SELECTOR).count()) > 0) return;
    await sleep(300);
  }
  // A cold Vite compiles before the first paint, and a stale dev server or a
  // failed module graph shows up here as a blank page, so the URL and the page
  // text are reported instead of a bare selector name.
  const where = page.url();
  const showing = await visibleText(page, 200).catch(() => "");
  throw new Error(
    `app not ready (no ${READY_SELECTOR}) within ${timeoutMs}ms; url=${where}; page shows: ${showing}`
  );
}

export async function tabLabels(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll('[role="tab"]')].map((node) => (node.textContent ?? "").trim())
  );
}

export async function clickTab(page: Page, label: string): Promise<void> {
  const tab = page.locator('[role="tab"]', { hasText: label }).first();
  await tab.click({ timeout: 10_000 });
}

// The app is localized (RU by default here), so scenarios pass both names.
// Matches by tab role plus text, which tolerates nested spans inside a tab.
export async function clickTabByAnyOf(page: Page, labels: readonly string[]): Promise<void> {
  const errors: string[] = [];
  for (const label of labels) {
    const tab = page.locator('[role="tab"]', { hasText: label }).first();
    try {
      await tab.click({ timeout: 5000 });
      return;
    } catch (error) {
      errors.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  throw new Error(`no tab matched [${labels.join(", ")}]; ${errors.join(" | ")}`);
}

export const TAB = {
  anilist: ["AniList", "АниЛіст", "АниList", "анилист"],
  collection: ["Collection", "Коллекция"],
  player: ["Player", "Плеер"],
  search: ["Search", "Поиск"],
  settings: ["Settings", "Parameters", "Параметры"],
  torrent: ["Torrent", "Торрент"],
} as const;

export const MAIN_URL = "localhost:1420";
export const PLAYER_URL = "localhost:1420/player-window";
