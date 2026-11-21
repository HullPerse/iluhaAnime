import type { Page } from "playwright-core";

import { clickTabByAnyOf, invokeRetryOnBusy, sleep, TAB, waitForReady } from "../cdp";
import type { Scenario } from "../harness";

const SETTINGS_KEY = "iluha.v1.settings";
const SETTINGS_SCHEMA_VERSION = 63;

const NAV_LABELS = ["Библиотека", "Поиск", "История", "Источники"] as const;

async function enableMangaTab(page: Page): Promise<void> {
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
      envelope.data = { ...envelope.data, mangaTabEnabled: true };
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

export const manga: Scenario = {
  name: "manga",
  async run({ page, step }) {
    await step("enable the manga tab", async () => {
      await waitForReady(page);
      await enableMangaTab(page);
    });

    await step("adult visibility moved out of general settings", async () => {
      await clickTabByAnyOf(page, TAB.settings);
      if (await page.getByRole("checkbox", { name: "Показывать 18+" }).count()) {
        throw new Error("adult visibility control remained in general settings");
      }
    });

    await step("manga shell renders", async () => {
      await clickTabByAnyOf(page, TAB.manga);
      await sleep(750);
      if (!page.url().includes("/manga")) {
        throw new Error(`expected /manga route, got ${page.url()}`);
      }
      for (const label of NAV_LABELS) {
        await expectVisible(page, label);
      }
      const errors = await page.locator('[role="alert"]').count();
      if (errors > 0) throw new Error("manga shell rendered an alert");
    });

    await step("library opens", async () => {
      await page.getByText("Библиотека", { exact: true }).first().click({ timeout: 10_000 });
      await sleep(500);
      const errors = await page.locator('[role="alert"]').count();
      if (errors > 0) throw new Error("manga library rendered an alert");
    });

    await step("history opens", async () => {
      await page.getByText("История", { exact: true }).first().click({ timeout: 10_000 });
      await sleep(500);
      await expectVisible(page, "Очистить историю");
    });

    await step("sources manages enabled catalogs in the wider navigation", async () => {
      const nav = page.getByRole("navigation", { name: "Манга" });
      await nav.getByRole("button", { name: "Источники" }).click();
      const bounds = await nav.boundingBox();
      if (bounds?.width !== 176) {
        throw new Error("manga navigation did not match the settings sidebar width");
      }
      const catalogs = page.getByRole("region", { name: "Каталоги", exact: true });
      await catalogs.getByRole("checkbox", { name: "MangaLib" }).waitFor();
      const dex = catalogs.getByRole("checkbox", { name: "MangaDex" });
      await dex.click();
      await catalogs.locator('[aria-label="MangaDex"][aria-checked="false"]').waitFor();
      await dex.click();
      await catalogs.locator('[aria-label="MangaDex"][aria-checked="true"]').waitFor();
      await catalogs.getByRole("checkbox", { name: "ReadManga" }).waitFor();
      await catalogs.getByRole("checkbox", { name: "AsuraScans" }).waitFor();
      await catalogs.getByRole("button", { name: "Настройки MangaLib" }).click();
      const sourceDialog = page.getByRole("dialog");
      const adult = sourceDialog.getByRole("checkbox", { name: "Показывать 18+" });
      await adult.waitFor();
      await adult.click();
      if (!(await adult.isChecked())) throw new Error("source adult visibility did not enable");
      await adult.click();
      if (await adult.isChecked()) throw new Error("source adult visibility did not disable");
      await page.keyboard.press("Escape");
      await sourceDialog.waitFor({ state: "hidden" });
      if (await page.getByLabel("Общий прокси", { exact: true }).count()) {
        throw new Error("proxy editing remained in the Manga tab");
      }
    });

    await step("manga proxy and chapter polling live in app settings", async () => {
      await clickTabByAnyOf(page, TAB.settings);
      const nav = page.getByRole("navigation", { name: "Разделы" });
      const integrations = nav.getByRole("button", { name: "Интеграции", exact: true });
      await integrations.waitFor();
      if (await integrations.isEnabled()) await integrations.click();
      const proxyTab = nav.getByRole("button", { name: "Прокси", exact: true });
      await proxyTab.waitFor();
      if (await proxyTab.isEnabled()) await proxyTab.click();
      const group = page.getByRole("region", { name: "Прокси манги" });
      const proxy = group.getByRole("textbox", { name: "Общий прокси", exact: true });
      const save = group.getByRole("button", { name: "Сохранить", exact: true });
      await proxy.fill("http://127.0.0.1:18080");
      await save.click();
      await nav.getByRole("button", { name: "Основное", exact: true }).click();
      await nav.getByRole("button", { name: "Уведомления", exact: true }).click();
      const polling = page
        .locator('[data-find-section="notifications.manga"]')
        .getByRole("checkbox");
      await polling.click();
      if (!(await polling.isChecked())) throw new Error("chapter polling did not enable");
      await polling.click();
      if (await polling.isChecked()) throw new Error("chapter polling did not disable");
      await nav.getByRole("button", { name: "Интеграции", exact: true }).click();
      if ((await proxy.inputValue()) !== "http://127.0.0.1:18080") {
        throw new Error("the manga proxy value was not saved");
      }
      await proxy.fill("");
      await save.click();
      await clickTabByAnyOf(page, TAB.manga);
    });

    await step("search returns results from both native sources", async () => {
      await page
        .getByRole("navigation", { name: "Манга" })
        .getByRole("button", { name: "Поиск" })
        .click();
      const search = page.getByLabel("Название манги");
      if (await page.getByRole("checkbox", { name: "Показывать 18+" }).count()) {
        throw new Error("adult visibility control remained in catalog search");
      }
      await search.fill("One Pie");
      await page
        .getByRole("option", { name: /One Piece|Ван Пис/i })
        .first()
        .waitFor({
          timeout: 15_000,
        });
      await search.press("ArrowDown");
      await search.press("Enter");
      if ((await search.inputValue()) === "One Pie") {
        throw new Error("keyboard selection did not apply autocomplete");
      }
      await search.fill("One Piece");
      await page.getByRole("button", { name: "Найти", exact: true }).click();
      await page
        .getByRole("region", { name: "MangaLib" })
        .getByText("Ван Пис", { exact: true })
        .first()
        .waitFor({ timeout: 25_000 });
      await page
        .getByRole("region", { name: "MangaDex" })
        .getByRole("listitem")
        .first()
        .waitFor({ timeout: 25_000 });
      const libCards = page.getByRole("region", { name: "MangaLib" }).getByRole("listitem");
      await Promise.all(
        Array.from({ length: 4 }, (_, index) =>
          libCards
            .nth(index)
            .locator("img")
            .evaluate(
              async (element) => {
                const image = element as HTMLImageElement;
                await image.decode();
                if (image.naturalWidth < 300) {
                  throw new Error(`MangaLib cover is only ${image.naturalWidth}px wide`);
                }
              },
              undefined,
              {
                timeout: 20_000,
              }
            )
        )
      );
    });

    await step("catalog groups preview results and pages a single source", async () => {
      const lib = page.getByRole("region", { name: "MangaLib" });
      const dex = page.getByRole("region", { name: "MangaDex" });
      const cards = lib.getByRole("listitem");
      if ((await cards.count()) !== 4) throw new Error("expected a four-title preview");
      await lib.getByRole("button", { name: "Показать все" }).click();
      await dex.waitFor({ state: "hidden" });
      await cards.nth(4).waitFor();
      await lib.getByRole("button", { name: "Следующая страница" }).click();
      await lib.getByText("Страница 2", { exact: true }).waitFor();
      await lib.getByRole("button", { name: "Предыдущая страница" }).click();
      await lib.getByText("Страница 1", { exact: true }).waitFor();
      await page.getByRole("button", { name: "Все источники", exact: true }).click();
      await dex.waitFor();
    });

    await step("MangaLib details display chapter translations", async () => {
      const card = page
        .getByRole("region", { name: "MangaLib" })
        .getByRole("button", { name: "Ван Пис", exact: true })
        .first();
      await card.evaluate((button) => {
        button.addEventListener(
          "click",
          () => {
            const start = performance.now();
            let opened = false;
            const sample = (now: number) => {
              const dialog = document.querySelector('[role="dialog"]');
              if (!opened && dialog && Number(getComputedStyle(dialog).opacity) > 0) {
                performance.measure("manga.detail.open", { start, end: now });
                opened = true;
              }
              if (dialog?.querySelector('[aria-label="Главы"]')) {
                performance.measure("manga.detail.ready", { start, end: now });
              } else if (now - start < 30_000) {
                requestAnimationFrame(sample);
              }
            };
            requestAnimationFrame(sample);
          },
          { once: true, capture: true }
        );
      });
      await card.click();
      const dialog = page.getByRole("dialog", { name: "Ван Пис" });
      await dialog
        .getByText(/^Глава \d+/)
        .first()
        .waitFor({ timeout: 30_000 });
      await dialog
        .getByRole("button", { name: /^Глава 0(?:\s|$)/ })
        .first()
        .waitFor();
      await dialog.getByText("Eiichiro Oda", { exact: true }).waitFor();
      await dialog.getByText("Приключения", { exact: true }).waitFor();
      const timings = await page.evaluate(async () => {
        await new Promise(requestAnimationFrame);
        return performance
          .getEntriesByType("measure")
          .filter((entry) => entry.name.startsWith("manga.detail."))
          .map(({ name, duration }) => [name, Math.round(duration)]);
      });
      if (timings.length !== 2) throw new Error("Expected both manga detail timings");
      console.log("[manga detail timings, ms]", timings);
    });

    await step("save a copy in the local library", async () => {
      const dialog = page.getByRole("dialog", { name: "Ван Пис" });
      const status = dialog.getByRole("combobox", { name: "Статус", exact: true });
      await status.click();
      await page.getByRole("option", { name: "Читаю", exact: true }).click();
      await dialog.getByRole("button", { name: "В избранное", exact: true }).waitFor();
    });

    await step("reader loads a native page and turns it with the keyboard", async () => {
      const dialog = page.getByRole("dialog", { name: "Ван Пис" });
      await dialog
        .getByRole("button", { name: /^Глава 0(?:\s|$)/ })
        .first()
        .click();
      const reader = page.getByRole("dialog", { name: "Читалка манги" });
      const first = reader.getByRole("img", { name: "Страница 1" });
      await first.waitFor({ timeout: 30_000 });
      await first.evaluate((element) => (element as HTMLImageElement).decode());
      await reader.focus();
      await page.keyboard.press("ArrowLeft");
      const second = reader.getByRole("img", { name: "Страница 2" });
      await second.waitFor({ timeout: 30_000 });
      await second.evaluate((element) => (element as HTMLImageElement).decode());
    });

    await step("reader toolbar uses app chrome and auto-hides", async () => {
      const reader = page.getByRole("dialog", { name: "Читалка манги" });
      const toolbar = reader.locator("header[data-reader-chrome]").first();
      const settings = toolbar.getByRole("button", { name: "Настройки" });
      await toolbar.getByText("Глава 0", { exact: true }).waitFor();
      await toolbar.getByRole("button", { name: "Выбрать главу" }).waitFor();
      const image = reader.getByRole("img", { name: "Страница 2" });
      await image.hover();
      await page.waitForFunction(() => {
        const titlebar = document.querySelector("dialog[open] header[data-reader-chrome]");
        return titlebar && getComputedStyle(titlebar).opacity === "0";
      });
      await settings.hover();
      if ((await toolbar.evaluate((element) => getComputedStyle(element).opacity)) !== "1") {
        throw new Error("reader toolbar did not reappear on hover");
      }
      await reader.getByText(/^2 \/ \d+$/).waitFor();
      await reader.getByRole("button", { name: "Переход к странице" }).click();
      const pages = reader.getByRole("group", { name: "Переход к странице" });
      const currentPage = pages.getByRole("button", { name: "Страница 2", exact: true });
      if ((await currentPage.getAttribute("aria-current")) !== "true") {
        throw new Error("page list did not mark the current page");
      }
      await page.keyboard.press("Escape");
      await pages.waitFor({ state: "hidden" });
      await settings.waitFor();
    });

    await step("reader settings are visible and keyboard focus stays inside", async () => {
      const reader = page.getByRole("dialog", { name: "Читалка манги" });
      await reader.getByRole("button", { name: "Настройки" }).click();
      const panel = reader.getByRole("complementary", { name: "Настройки" });
      if (
        (await panel.evaluate((element) => getComputedStyle(element).backgroundColor)) !==
        "rgb(192, 192, 192)"
      ) {
        throw new Error("reader preferences did not use the opaque Win95 panel");
      }
      const mode = reader.getByRole("button", { name: "Слева направо", exact: true });
      await mode.click();
      if ((await mode.getAttribute("aria-pressed")) !== "true")
        throw new Error("reading mode did not change");
      await panel.getByRole("button", { name: "Фон", exact: true }).press("Enter");
      const sepia = panel.getByRole("button", { name: "Сепия", exact: true });
      await sepia.click();
      if ((await sepia.getAttribute("aria-pressed")) !== "true") {
        throw new Error("background selection did not change");
      }
      if (
        (await reader.evaluate((element) => getComputedStyle(element).backgroundColor)) !==
        "rgb(237, 224, 200)"
      ) {
        throw new Error("the reading canvas did not turn sepia");
      }
      await page.keyboard.press("Tab");
      if (!(await reader.evaluate((element) => element.contains(document.activeElement)))) {
        throw new Error("focus escaped the fullscreen reader");
      }
    });

    await step("reader frames render", async () => {
      const reader = page.getByRole("dialog", { name: "Читалка манги" });
      const panel = reader.getByRole("complementary", { name: "Настройки" });
      await panel.getByRole("button", { name: "Страница", exact: true }).click();
      await reader.getByRole("combobox", { name: "Рамка страницы" }).click();
      await page.getByRole("option", { name: "Окно Windows 95", exact: true }).click();
      const frame = reader.locator('[data-manga-page-frame="win95"]');
      await frame.waitFor();
      const pageImage = reader.getByRole("img", { name: "Страница 2" });
      const [imageBounds, frameBounds] = await Promise.all([
        pageImage.boundingBox(),
        frame.boundingBox(),
      ]);
      if (!imageBounds || !frameBounds || Math.abs(imageBounds.width - frameBounds.width) > 2) {
        throw new Error("the frame did not match the visible page");
      }
      await page.waitForFunction((key) => {
        const raw = localStorage.getItem(key);
        if (!raw) return false;
        const { data } = JSON.parse(raw) as { data: Record<string, unknown> };
        return data.mangaReaderFrame === "win95";
      }, SETTINGS_KEY);
    });

    await step("return from the reader", async () => {
      const dialog = page.getByRole("dialog", { name: "Ван Пис" });
      const reader = page.getByRole("dialog", { name: "Читалка манги" });
      await page.keyboard.press("Escape");
      await reader.getByRole("complementary", { name: "Настройки" }).waitFor({ state: "hidden" });
      const settings = reader.getByRole("button", { name: "Настройки" });
      if (!(await settings.evaluate((element) => element === document.activeElement))) {
        throw new Error("focus did not return to the reader settings button");
      }
      await page.keyboard.press("Escape");
      await dialog.waitFor();
      await dialog.getByRole("button", { name: "Закрыть" }).click();
    });

    await step("history restores the reader and book mode displays a spread", async () => {
      const nav = page.getByRole("navigation", { name: "Манга" });
      await nav.getByRole("button", { name: "История" }).click();
      await page.getByRole("button", { name: /Ван Пис - Глава 0/ }).click();
      const reader = page.getByRole("dialog", { name: "Читалка манги" });
      await reader.getByRole("img", { name: "Страница 2" }).waitFor({ timeout: 30_000 });
      await reader.getByRole("button", { name: "Настройки" }).click();
      const panel = reader.getByRole("complementary", { name: "Настройки" });
      await panel.getByRole("button", { name: "Разворот", exact: true }).click();
      await reader.getByRole("img", { name: "Страница 3" }).waitFor();
      await reader.getByText(/^2-3 \/ \d+$/).waitFor();
      await page.keyboard.press("Escape");
    });

    await step("wide pages turn by half", async () => {
      const reader = page.getByRole("dialog", { name: "Читалка манги" });
      await reader.getByRole("button", { name: "Настройки" }).click();
      const panel = reader.getByRole("complementary", { name: "Настройки" });
      await panel.getByRole("button", { name: "Страница", exact: true }).click();
      await panel.getByRole("checkbox", { name: "Разделять широкие страницы" }).click();
      const image = reader.getByRole("img", { name: "Страница 2" });
      await image.evaluate(async (element) => {
        const canvas = document.createElement("canvas");
        canvas.width = 800;
        canvas.height = 400;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Could not generate a wide image");
        context.fillStyle = "white";
        context.fillRect(0, 0, 800, 400);
        context.fillStyle = "gold";
        context.fillRect(40, 20, 360, 360);
        context.fillStyle = "navy";
        context.fillRect(400, 20, 360, 360);
        const img = element as HTMLImageElement;
        img.src = canvas.toDataURL();
        await img.decode();
      });
      await page.keyboard.press("Escape");
      await page.waitForFunction(
        () =>
          document.querySelector<HTMLImageElement>('dialog[open] img[alt="Страница 2"]')?.style
            .transform === "translateX(-50%)"
      );
      await reader.focus();
      await page.keyboard.press("ArrowLeft");
      if (await image.evaluate((element) => (element as HTMLImageElement).style.transform)) {
        throw new Error("turning the wide page did not show its other half");
      }
    });

    await step("return from the restored reader", async () => {
      const dialog = page.getByRole("dialog", { name: "Ван Пис" });
      await page.keyboard.press("Escape");
      await dialog.waitFor();
      await dialog.getByRole("button", { name: "Закрыть" }).click();
      await page
        .getByRole("navigation", { name: "Манга" })
        .getByRole("button", { name: "Поиск", exact: true })
        .click();
    });

    await step("a pasted chapter link reopens the translation", async () => {
      const [entry] = await invokeRetryOnBusy<
        Array<{ source: string; mangaId: string; chapterId: string }>
      >(page, "manga_history_list", { nsfw: false });
      if (!entry) throw new Error("No recent chapter for the manga link");
      await page.evaluate((url) => {
        const clipboard = new DataTransfer();
        clipboard.setData("text", url);
        document.body.dispatchEvent(
          new ClipboardEvent("paste", { bubbles: true, clipboardData: clipboard })
        );
      }, `iluhaanime://manga/${entry.source}/${entry.mangaId}/${entry.chapterId}`);
      const reader = page.getByRole("dialog", { name: "Читалка манги" });
      await reader.getByText("Глава 0", { exact: true }).waitFor();
      await page.keyboard.press("Escape");
      const dialog = page.getByRole("dialog", { name: "Ван Пис" });
      await dialog.getByRole("button", { name: "Закрыть" }).click();
    });

    await step("search marks only the saved copy from the matching source", async () => {
      const lib = page.getByRole("region", { name: "MangaLib" });
      const dex = page.getByRole("region", { name: "MangaDex" });
      const title = lib.getByRole("button", { name: "Ван Пис", exact: true });
      await title.getByTitle("Читаю", { exact: true }).waitFor();
      await dex.getByRole("article").first().waitFor();
      if (await dex.getByTitle("Читаю", { exact: true }).count()) {
        throw new Error("saved status leaked to a different source");
      }
      if ((await lib.getByTitle("Читаю", { exact: true }).count()) !== 1) {
        throw new Error("saved status leaked to a different title");
      }
    });

    await step("history clear keeps the saved title in the library", async () => {
      const nav = page.getByRole("navigation", { name: "Манга" });
      await nav.getByRole("button", { name: "История" }).click();
      await page.getByRole("button", { name: /Ван Пис - Глава 0/ }).waitFor();
      await page.getByRole("button", { name: "Очистить историю" }).click();
      await page.getByText("История чтения пуста.").waitFor();
      await nav.getByRole("button", { name: "Библиотека" }).click();
      await page.getByRole("button", { name: "Ван Пис", exact: true }).waitFor();
    });

    await step("shelf card shows status, chapter progress and unread count", async () => {
      const card = page.getByRole("article").filter({
        has: page.getByRole("button", { name: "Ван Пис", exact: true }),
      });
      const title = card.getByRole("button", { name: "Ван Пис", exact: true });
      await title.getByTitle("Читаю", { exact: true }).waitFor();
      const bar = card.getByRole("progressbar", { name: /Прочитано глав/ });
      const unread =
        Number(await bar.getAttribute("aria-valuemax")) -
        Number(await bar.getAttribute("aria-valuenow"));
      const badge = card.locator(".cards-shelf-art").getByTitle(`Непрочитанных глав: ${unread}`);
      if (unread <= 0 || Number(await badge.textContent()) !== unread) {
        throw new Error("unread cover badge did not match chapter progress");
      }
      await card.locator("img").evaluate((element) => (element as HTMLImageElement).decode());
    });

    await step("library search filters titles and accepts keyboard suggestions", async () => {
      const search = page.getByLabel("Поиск в библиотеке");
      await search.fill("несуществующая манга");
      await page.getByRole("button", { name: "Ван Пис", exact: true }).waitFor({ state: "hidden" });
      await search.fill("Ван П");
      await page.getByRole("option", { name: /Ван Пис/ }).waitFor();
      await search.press("ArrowDown");
      await search.press("Enter");
      if ((await search.inputValue()) !== "Ван Пис")
        throw new Error("library suggestion was not applied");
      await page.getByRole("button", { name: "Ван Пис", exact: true }).waitFor();
      await search.fill("");
    });

    await step("library status row shows totals and filters saved titles", async () => {
      const statuses = page.getByRole("group", { name: "Статус", exact: true });
      const book = page.getByRole("button", { name: "Ван Пис", exact: true });
      await statuses.getByRole("button", { name: "Читаю (1)", exact: true }).click();
      await book.waitFor();
      await statuses.getByRole("button", { name: "Прочитано (0)", exact: true }).click();
      await book.waitFor({ state: "hidden" });
      await statuses.getByRole("button", { name: "Все (1)", exact: true }).click();
      await book.waitFor();
    });

    await step("saved books can be displayed as a list", async () => {
      const list = page.getByRole("button", { name: "Список", exact: true });
      await list.click();
      await page.getByRole("button", { name: "Карточки", exact: true }).waitFor();
      await page.getByRole("button", { name: "Ван Пис", exact: true }).waitFor();
    });

    await step("ReadManga and AsuraScans open real pages", async () => {
      const nav = page.getByRole("navigation", { name: "Манга" });
      await nav.getByRole("button", { name: "Источники" }).click();
      const catalogs = page.getByRole("region", { name: "Каталоги", exact: true });
      for (const name of ["ReadManga", "AsuraScans"]) {
        const toggle = catalogs.getByRole("checkbox", { name });
        if (!(await toggle.isChecked())) await toggle.click();
        await catalogs.locator(`[aria-label="${name}"][aria-checked="true"]`).waitFor();
      }
      await nav.getByRole("button", { name: "Поиск", exact: true }).click();
      for (const { source, query, title, chapter, language } of [
        {
          source: "ReadManga",
          query: "Yotsuba",
          title: /Ёцуба и!/,
          chapter: /^Глава 1(?:\s|$)/,
          language: /^RU /,
        },
        {
          source: "AsuraScans",
          query: "Reincarnator",
          title: /^Reincarnator$/,
          chapter: /^Глава 0(?:\s|$)/,
          language: /^EN /,
        },
      ]) {
        await page.getByLabel("Название манги").fill(query);
        await page.getByRole("button", { name: "Найти", exact: true }).click();
        await page
          .getByRole("region", { name: source, exact: true })
          .getByRole("button", { name: title })
          .first()
          .click({ timeout: 30_000 });
        const details = page.getByRole("dialog", { name: title });
        await details
          .getByText(chapter)
          .first()
          .locator("../..")
          .getByRole("button", { name: language })
          .first()
          .click({ timeout: 30_000 });
        const reader = page.getByRole("dialog", { name: "Читалка манги" });
        const image = reader.getByRole("img", { name: "Страница 1" });
        await image.waitFor({ timeout: 30_000 });
        await image.evaluate((element) => (element as HTMLImageElement).decode());
        await page.keyboard.press("Escape");
        await details.getByRole("button", { name: "Закрыть" }).click();
      }
    });

    await step("AniList manga mode searches the public catalog", async () => {
      await clickTabByAnyOf(page, TAB.anilist);
      const modes = page.getByRole("group", { name: "Режим профиля Аниме / Манга" });
      await modes.getByRole("button", { name: "Манга", exact: true }).click();
      await modes.getByRole("button", { name: "Манга", exact: true, pressed: true }).waitFor();
      await page.getByRole("textbox", { name: "Название манги" }).fill("Yotsuba");
      await page.getByRole("button", { name: "Найти", exact: true }).click();
      await page
        .getByRole("button", { name: /Yotsuba/i })
        .first()
        .waitFor({ timeout: 30_000 });
    });
  },
};
