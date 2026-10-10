// Settings + repro bundle scenario.
//
// The native save dialog cannot be stubbed from the page: in this Tauri
// version every function on `window.__TAURI_INTERNALS__` (including `invoke`)
// is a non-writable, non-configurable own property, so replacing it is a
// silent no-op and the real modal dialog would block the run. The button is
// still verified in the UI (present and enabled, which is the state the
// disabled TMDB button used to break), and the bundle itself is produced by
// driving the real `collect_repro_bundle` command over real IPC.

import { spawnSync } from "node:child_process";
import { join } from "node:path";

import type { Page } from "playwright-core";

import { TAB, clickTabByAnyOf, invoke } from "../cdp";
import { fixtureRoot, type Scenario } from "../harness";

const FIXTURES = fixtureRoot();
const OUT = join(FIXTURES, "repro-out.zip");
const OVERSIZE = `${OUT}.oversize.zip`;
const RU_SUMMARY = "\u0421\u0432\u043E\u0434\u043A\u0430";
const RU_LABEL =
  "\u041F\u0430\u043A\u0435\u0442 \u0434\u043B\u044F \u0431\u0430\u0433\u0440\u0435\u043F\u043E\u0440\u0442\u0430";

function powershell(script: string): string {
  const result = spawnSync("powershell", ["-NoProfile", "-Command", script], {
    encoding: "utf-8",
    windowsHide: true,
  });
  if (result.status !== 0) throw new Error(result.stderr ?? "powershell failed");
  return result.stdout ?? "";
}

function openZip(): string {
  return "Add-Type -AssemblyName System.IO.Compression.FileSystem;";
}

async function zipEntryNames(path: string): Promise<string[]> {
  const out = powershell(
    `${openZip()} [System.IO.Compression.ZipFile]::OpenRead('${path}') ` +
      `| ForEach-Object { $_.Entries } | ForEach-Object { $_.FullName }`
  );
  return out
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function readZipEntry(path: string, entry: string): string {
  return powershell(
    `${openZip()} $zip=[System.IO.Compression.ZipFile]::OpenRead('${path}'); ` +
      `$item=$zip.GetEntry('${entry}'); ` +
      `$reader=New-Object System.IO.StreamReader($item.Open()); ` +
      `$text=$reader.ReadToEnd(); $reader.Close(); $zip.Dispose(); $text`
  ).trim();
}

// Same shape the app sends: version, counts, settings snapshot.
function frontendPayload(): string {
  return JSON.stringify({
    counts: { animeIndex: 0, history: 0, queryStats: 0 },
    settings: { language: "ru", theme: "win95" },
    version: "5.0.0",
  });
}

async function tryInvoke(
  page: Page,
  command: string,
  args: Record<string, unknown>
): Promise<string> {
  return page.evaluate(
    async (input: { command: string; args: Record<string, unknown> }) => {
      const internals = (
        window as unknown as {
          __TAURI_INTERNALS__?: { invoke: (cmd: string, args?: unknown) => Promise<unknown> };
        }
      ).__TAURI_INTERNALS__;
      if (!internals) throw new Error("no tauri runtime");
      try {
        await internals.invoke(input.command, input.args);
        return "";
      } catch (error) {
        return error instanceof Error ? error.message : String(error);
      }
    },
    { command, args }
  );
}

export const repro: Scenario = {
  name: "repro",
  async run({ page, step }) {
    await step("settings summary is open", async () => {
      await clickTabByAnyOf(page, TAB.settings);
      const summary = page.locator(`text=/summary|${RU_SUMMARY}/i`).first();
      const found = await summary
        .waitFor({ timeout: 20_000 })
        .then(() => true)
        .catch(() => false);
      if (!found) throw new Error("settings summary did not render");
    });

    await step("repro row offers an enabled save action", async () => {
      const row = page
        .locator("div")
        .filter({ has: page.locator(`text=/${RU_LABEL}|Bug report bundle/i`) })
        .last();
      const button = row.locator("button").first();
      await button.waitFor({ timeout: 15_000 });
      const text = await button.textContent();
      const label = (text ?? "").trim();
      if (!/save|Сохранить/i.test(label)) {
        throw new Error(`repro row action is not a save button: "${label}"`);
      }
      const enabled = await button.isEnabled();
      if (!enabled) throw new Error("repro save button is disabled");
    });

    await step("command writes a bundle", async () => {
      const saved = await invoke<string>(page, "collect_repro_bundle", {
        outPath: OUT,
        frontendJson: frontendPayload(),
      });
      if (saved !== OUT) throw new Error(`command returned ${String(saved)}`);
    });

    await step("bundle is well formed", async () => {
      const names = await zipEntryNames(OUT);
      for (const expected of ["meta.json", "frontend.json", "storage.json", "README.txt"]) {
        if (!names.includes(expected)) {
          throw new Error(`missing ${expected}; got ${names.join(", ")}`);
        }
      }
      const meta = JSON.parse(readZipEntry(OUT, "meta.json")) as { os: string };
      if (meta.os !== "windows") throw new Error(`meta.os = ${meta.os}`);
      const readme = readZipEntry(OUT, "README.txt");
      if (!readme.includes("Privacy")) throw new Error("README.txt has no privacy note");
    });

    await step("storage listing is a summary, not the data", async () => {
      const storage = JSON.parse(readZipEntry(OUT, "storage.json")) as { name: string }[];
      const names = storage.map((entry) => entry.name);
      if (!names.includes("app_data.sqlite3")) {
        throw new Error(`storage listing lacks the database: ${names.join(", ")}`);
      }
      if (names.some((name) => /\.(mkv|mp4)$/i.test(name))) {
        throw new Error("storage listing leaks media files");
      }
    });

    await step("oversized snapshots are refused", async () => {
      const message = await tryInvoke(page, "collect_repro_bundle", {
        outPath: OVERSIZE,
        frontendJson: `{"blob":"${"x".repeat(300 * 1024)}"}`,
      });
      if (!/too large/i.test(message))
        throw new Error(`expected a size rejection, got: ${message}`);
    });
  },
};
