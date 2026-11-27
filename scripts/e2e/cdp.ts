import { chromium, type Browser, type Page } from "playwright-core";

const DEFAULT_CDP_PORT = 9222;

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
const READY_SELECTOR = '[role="tab"]';

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

export async function connectCdp(
  waitMs = 900_000,
  appExitCode?: () => number | null
): Promise<Browser> {
  const port = cdpPort();
  const started = Date.now();
  let lastError: unknown;
  let announced = 0;

  while (Date.now() - started < waitMs) {
    const exitCode = appExitCode?.();

    if (exitCode !== undefined && exitCode !== null) {
      throw new Error(`Tauri exited before CDP became available (code ${exitCode})`);
    }

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

async function findPage(
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
  return findPage(browser, (url) => isAppUrl(url) && !url.includes("/player-window"), timeoutMs);
}

export async function findPlayerPage(browser: Browser, timeoutMs = 40_000): Promise<Page> {
  return findPage(browser, (url) => isAppUrl(url) && url.includes("/player-window"), timeoutMs);
}

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

export async function visibleText(page: Page, maxLength = 400): Promise<string> {
  const text =
    (await page
      .locator("body")
      .textContent()
      .catch(() => "")) ?? "";

  return text.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

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
  manga: ["Manga", "Манга"],
  player: ["Player", "Плеер"],
  search: ["Search", "Поиск"],
  settings: ["Settings", "Parameters", "Параметры"],
  torrent: ["Torrent", "Торрент"],
} as const;

export function isAppUrl(value: string): boolean {
  try {
    const url = new URL(value);

    return (
      ((url.protocol === "http:" || url.protocol === "https:") &&
        (url.hostname === "tauri.localhost" ||
          ((url.hostname === "localhost" || url.hostname === "127.0.0.1") &&
            url.port === "1420"))) ||
      (url.protocol === "tauri:" && url.hostname === "localhost")
    );
  } catch {
    return false;
  }
}
