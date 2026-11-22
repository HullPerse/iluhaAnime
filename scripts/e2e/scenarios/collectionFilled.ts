import type { Page } from "playwright-core";

import { clickTabByAnyOf, sleep, TAB } from "../cdp";
import { seedFilledCollection } from "../fixtures/filledCollection";
import type { Scenario } from "../harness";

import { clickTab, enableCollectionTab, expectVisible } from "./collection";

async function closeCardDetail(page: Page): Promise<void> {
  await page
    .locator('[role="dialog"] button[aria-label="Закрыть"]')
    .last()
    .click({ timeout: 10_000 });
  await page.locator(".cards-detail").waitFor({ state: "hidden", timeout: 10_000 });
}

async function settledCount(page: Page, command: string): Promise<number> {
  return page.evaluate((name) => {
    const read = (
      window as unknown as {
        __iluhaTransportStats?: () => Array<{ command: string; durationsMs: number[] }>;
      }
    ).__iluhaTransportStats;

    return read?.().find((stat) => stat.command === name)?.durationsMs.length ?? 0;
  }, command);
}

async function waitForSettled(
  page: Page,
  command: string,
  before: number,
  timeout = 20_000
): Promise<void> {
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    if ((await settledCount(page, command)) > before) return;
    await sleep(100);
  }

  throw new Error(`${command} did not settle within ${timeout}ms`);
}

async function invalidateCardQueries(page: Page, keys: string[]): Promise<void> {
  await page.evaluate(async (scopes) => {
    const client = (
      window as unknown as {
        __iluhaQueryClient?: {
          invalidateQueries: (filters: {
            queryKey: string[];
            refetchType: "active";
          }) => Promise<void>;
        };
      }
    ).__iluhaQueryClient;

    for (const scope of scopes) {
      await client?.invalidateQueries({ queryKey: [scope], refetchType: "active" });
    }
  }, keys);
}

export const collectionFilled: Scenario = {
  name: "collectionFilled",
  async run({ page, step }) {
    await step("seed a filled collection and load the shell", async () => {
      await seedFilledCollection();
      await enableCollectionTab(page);
      await clickTabByAnyOf(page, TAB.collection);
      await expectVisible(page, "Карты");
      const count = await page.getByTestId("collection-card-count").textContent();

      if (count?.trim() !== "9") {
        throw new Error(`card counter is "${count}", expected "9" after seeding`);
      }
    });

    await step("filled album renders the seeded cards", async () => {
      await clickTab(page, "Альбом");
      const faces = page.locator("[data-card-face]");
      await faces.first().waitFor({ timeout: 30_000 });
      const count = await faces.count();

      if (count < 6) throw new Error(`filled album rendered ${count} cards, expected at least 6`);
    });

    await step("card detail opens from the filled album", async () => {
      const galleryBefore = await settledCount(page, "cards_gallery");
      const animeBefore = await settledCount(page, "get_anime_by_id");
      await page.locator("[data-card-face]").first().click();
      await page.locator(".cards-detail").waitFor({ timeout: 15_000 });

      if (process.env.E2E_MEASURE_GALLERY === "1") {
        await waitForSettled(page, "cards_gallery", galleryBefore, 35_000);
      }

      if (process.env.E2E_MEASURE_ANIME_LOOKUP === "1") {
        await waitForSettled(page, "get_anime_by_id", animeBefore, 35_000);
      }

      await closeCardDetail(page);
    });

    await step("collections shelf lists the seeded collections", async () => {
      await page.getByRole("button", { name: "Коллекция", exact: true }).click({
        timeout: 10_000,
      });
      await page.getByTestId("collection-shelf").waitFor({ timeout: 30_000 });
      const tiles = page.getByTestId("collection-shelf-tile");
      const count = await tiles.count();

      if (count < 3)
        throw new Error(`collection shelf rendered ${count} tiles, expected at least 3`);
      const attackOnTitan = tiles.filter({ hasText: /Attack on Titan|Shingeki no Kyojin/ });
      const target = (await attackOnTitan.count()) > 0 ? attackOnTitan.first() : tiles.first();
      await target.click();
      await page.getByTestId("anime-collection-page").waitFor({ timeout: 30_000 });
    });

    await step("collection page shows owned and roster cards", async () => {
      const pockets = page.locator('[data-testid="binder-pocket"]:not([data-empty="true"])');
      await pockets.first().waitFor({ timeout: 30_000 });
      const count = await pockets.count();

      if (count < 2) {
        throw new Error(`collection page rendered ${count} owned pockets, expected at least 2`);
      }

      await pockets.first().click();
      await page.locator(".cards-detail").waitFor({ timeout: 15_000 });
      await closeCardDetail(page);
    });

    await step("warm album refetches without a network metadata pass", async () => {
      await page.getByRole("button", { name: "Назад" }).click({ timeout: 10_000 });
      await page.getByRole("button", { name: "Все", exact: true }).click({ timeout: 10_000 });
      await page.locator("[data-card-face]").first().waitFor({ timeout: 30_000 });
      const before = await settledCount(page, "cards_collection");
      await invalidateCardQueries(page, ["cards-collection"]);
      await waitForSettled(page, "cards_collection", before, 30_000);
    });

    await step("warm shelf refetches the collection list", async () => {
      await page.getByRole("button", { name: "Коллекция", exact: true }).click({
        timeout: 10_000,
      });
      await page.getByTestId("collection-shelf").waitFor({ timeout: 30_000 });
      const before = await settledCount(page, "cards_collections");
      await invalidateCardQueries(page, ["cards-collections"]);
      await waitForSettled(page, "cards_collections", before, 30_000);
    });

    await step("warm roster refetches from the database cache", async () => {
      const tiles = page.getByTestId("collection-shelf-tile");
      const attackOnTitan = tiles.filter({ hasText: /Attack on Titan|Shingeki no Kyojin/ });
      const target = (await attackOnTitan.count()) > 0 ? attackOnTitan.first() : tiles.first();
      await target.click({ timeout: 10_000 });
      await page.getByTestId("anime-collection-page").waitFor({ timeout: 30_000 });
      const collectionBefore = await settledCount(page, "cards_anime_collection");
      const rosterBefore = await settledCount(page, "cards_collection_roster");
      await invalidateCardQueries(page, ["cards-anime-collection", "cards-collection-roster"]);
      await waitForSettled(page, "cards_anime_collection", collectionBefore, 30_000);
      await waitForSettled(page, "cards_collection_roster", rosterBefore, 30_000);
    });
  },
};
