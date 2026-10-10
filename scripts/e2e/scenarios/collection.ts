// Collection scenario: seeds through the real import command, then asserts
// the list renders, filtering and sorting work.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { TAB, clickTabByAnyOf, invokeRetryOnBusy, sleep } from "../cdp";
import type { Scenario } from "../harness";

function fixture(): Record<string, unknown> {
  const raw = readFileSync(
    join(process.cwd(), "scripts", "e2e", "fixtures", "collection.json"),
    "utf-8"
  );
  const items = JSON.parse(raw) as Array<Record<string, unknown>>;
  return { customFieldDefs: [], exportedAt: 0, items, version: 1 };
}

export const collection: Scenario = {
  name: "collection",
  async run({ page, step }) {
    await step("import fixture collection", async () => {
      const summary = await invokeRetryOnBusy<{ imported: number }>(
        page,
        "import_collection_data",
        { data: fixture(), strategy: "create_new" }
      );
      if (summary.imported !== 12) throw new Error(`imported=${summary.imported}, expected 12`);
    });

    await step("collection tab lists items", async () => {
      await clickTabByAnyOf(page, TAB.collection);
      await page.locator("text=Sousou no Frieren").first().waitFor({ timeout: 25_000 });
      // A persisted search query would silently narrow the list to one row, so
      // assert the box starts empty before counting cards.
      const search = page.getByPlaceholder(/Search title|Поиск по названию/i).first();
      const value = (await search.inputValue()) ?? "";
      if (value !== "") throw new Error(`search box starts with a stale query: "${value}"`);
      // Cards render in staggered batches, so poll instead of sampling once.
      const cards = page.locator("text=/Frieren|Bocchi|Odd Taxi|Monster/");
      const started = Date.now();
      let visible = 0;
      while (Date.now() - started < 15_000) {
        visible = await cards.count();
        if (visible >= 4) return;
        await sleep(500);
      }
      throw new Error(`only ${visible} expected titles visible`);
    });

    await step("search narrows the list", async () => {
      // The collection search box has no type attribute (base-ui Input), so it
      // is reached by placeholder: "Search title..." / "Поиск по названию...".
      const search = page.getByPlaceholder(/Search title|Поиск по названию/i).first();
      await search.waitFor({ timeout: 10_000 });
      await search.fill("bocchi");
      await page.locator("text=Bocchi the Rock!").first().waitFor({ timeout: 20_000 });
      // Wait for the row to leave instead of sampling the count once: the
      // filter result re-renders asynchronously after the query is typed.
      const stray = page.locator("text=Monster").first();
      const gone = await stray
        .waitFor({ state: "hidden", timeout: 10_000 })
        .then(() => true)
        .catch(() => false);
      if (!gone) throw new Error("unrelated item still visible after search");
    });

    await step("clearing search restores the list", async () => {
      const search = page.getByPlaceholder(/Search title|Поиск по названию/i).first();
      await search.fill("");
      await page.locator("text=Monster").first().waitFor({ timeout: 20_000 });
    });
  },
};
