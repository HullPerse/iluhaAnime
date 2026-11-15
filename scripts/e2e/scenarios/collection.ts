// Collection scenario: enables the card tab in the isolated e2e profile and
// walks the current surface (packs, album, shop, daily game, gifts).
//
// It runs signed out, so cards cannot be seeded: packs and rewards require an
// AniList account. The scenario therefore checks the empty states and the
// surfaces that do not need an account.

import type { Page } from "playwright-core";

import { clickTabByAnyOf, sleep, TAB, waitForReady } from "../cdp";
import type { Scenario } from "../harness";

const SETTINGS_KEY = "iluha.v1.settings";
const SETTINGS_SCHEMA_VERSION = 61;

async function enableCollectionTab(page: Page): Promise<void> {
  await page.evaluate(
    ({ key, sv }) => {
      const raw = localStorage.getItem(key);
      const envelope =
        raw === null
          ? { f: 1, store: "settings", sv, ts: Date.now(), data: {} }
          : (JSON.parse(raw) as {
              f: number;
              store: string;
              sv: number;
              ts?: number;
              data: Record<string, unknown>;
            });
      envelope.data = { ...envelope.data, collectionTabEnabled: true };
      localStorage.setItem(key, JSON.stringify(envelope));
    },
    { key: SETTINGS_KEY, sv: SETTINGS_SCHEMA_VERSION }
  );
  await page.reload();
  await waitForReady(page);
}

async function expectVisible(page: Page, text: string, timeout = 15_000): Promise<void> {
  await page.locator(`text=${text}`).first().waitFor({ timeout });
}

async function clickTab(page: Page, name: string): Promise<void> {
  const tab = page.getByRole("tab", { name }).first();
  // The active tab is disabled on purpose, so selecting it again is a no-op.
  if ((await tab.getAttribute("aria-selected")) === "true") return;
  await tab.click({ timeout: 10_000 });
}

export const collection: Scenario = {
  name: "collection",
  async run({ page, step }) {
    await step("enable the collection tab", async () => {
      await enableCollectionTab(page);
      await page.locator('[role="tab"]', { hasText: "Коллекция" }).first().waitFor({
        timeout: 10_000,
      });
    });

    await step("collection shell renders", async () => {
      await clickTabByAnyOf(page, TAB.collection);
      await expectVisible(page, "Карты");
      await expectVisible(page, "Магазин");
      await expectVisible(page, "Чубрики");
      const errors = await page.locator('[role="alert"]').count();
      if (errors > 0) throw new Error("collection shell rendered an alert");
    });

    await step("packs tab has no packs while signed out", async () => {
      await clickTab(page, "Паки");
      await sleep(1_500);
      const packCards = await page.locator("article").count();
      if (packCards !== 0) throw new Error(`expected no packs, found ${packCards} cards`);
      const cardCount = await page.getByTestId("collection-card-count").textContent();
      if ((cardCount ?? "").trim() !== "0") {
        throw new Error(`card counter is "${cardCount}", expected "0"`);
      }
    });

    await step("album shows the empty state and toolbar", async () => {
      await clickTab(page, "Альбом");
      await page.getByPlaceholder("Поиск по карточкам").first().waitFor({ timeout: 10_000 });
      await expectVisible(page, "В альбоме пока нет карточек.");
    });

    await step("album binder toggle switches back to the grid", async () => {
      await page.getByRole("button", { name: "Биндер", exact: true }).click({ timeout: 10_000 });
      await page.getByRole("button", { name: "Сетка", exact: true }).waitFor({ timeout: 10_000 });
    });

    await step("collections mode renders without cards", async () => {
      await page.getByRole("button", { name: "Коллекция", exact: true }).click({
        timeout: 10_000,
      });
      await sleep(1_500);
      const shelf = await page.getByTestId("collection-shelf").count();
      if (shelf !== 0) throw new Error("shelf rendered without any owned collections");
    });

    await step("shop lists six packs and blocks a zero wallet", async () => {
      await clickTab(page, "Магазин");
      await page.locator(".cards-shop-pack").first().waitFor({ timeout: 15_000 });
      const packs = await page.locator(".cards-shop-pack").count();
      if (packs !== 6) throw new Error(`expected 6 shop packs, found ${packs}`);
      const disabled = await page.locator(".cards-shop-buy:disabled").count();
      if (disabled !== 6) throw new Error(`expected 6 unaffordable packs, found ${disabled}`);
    });

    await step("daily game renders its three modes", async () => {
      await clickTab(page, "iluhaGuesser");
      await expectVisible(page, "Кадры");
      await expectVisible(page, "Опенинг");
      await expectVisible(page, "На слух");
      await expectVisible(page, "Серия:");
    });

    await step("gifts tab renders without a crash", async () => {
      await clickTab(page, "Подарки");
      await sleep(1_500);
      const errors = await page.locator('[role="alert"]').count();
      if (errors > 0) throw new Error("gifts tab rendered an alert");
    });
  },
};
