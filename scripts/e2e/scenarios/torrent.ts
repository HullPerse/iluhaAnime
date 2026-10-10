// Torrent scenario: creates a torrent from a fixture folder through the real
// backend command, then asserts the row appears in the torrent list.

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { TAB, clickTabByAnyOf, invokeRetryOnBusy } from "../cdp";
import { fixtureRoot } from "../harness";
import type { Scenario } from "../harness";

function fixtureDir(): string {
  const dir = join(fixtureRoot(), "media", "e2e-release");
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const content = "iluha e2e fixture payload ".repeat(64);
  writeFileSync(join(dir, "[SubsPlease] Frieren - 01 [1080p].mkv"), content);
  writeFileSync(join(dir, "[SubsPlease] Frieren - 01 [1080p].ass"), content);
  writeFileSync(join(dir, "info.nfo"), "e2e");
  return dir;
}

export const torrent: Scenario = {
  name: "torrent",
  async run({ page, step }) {
    await step("create torrent from fixture folder", async () => {
      const result = await invokeRetryOnBusy<{ info_hash?: string }>(
        page,
        "create_torrent_from_folder",
        { sourceDir: fixtureDir() }
      );
      const hash = result.info_hash ?? "";
      if (!/^[0-9a-f]{40}$/.test(hash)) throw new Error(`bad info hash: ${hash || "empty"}`);
    });

    await step("torrent appears in the list", async () => {
      await clickTabByAnyOf(page, TAB.torrent);
      await page.locator("text=e2e-release").first().waitFor({ timeout: 40_000 });
    });

    await step("row is not in an error state", async () => {
      const error = page.locator("text=/failed|error/i").first();
      if ((await error.count()) > 0) throw new Error("error text visible on the torrent row");
    });
  },
};
