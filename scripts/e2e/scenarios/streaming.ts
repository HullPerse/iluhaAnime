import { join } from "node:path";
import { SCHEMA_VERSIONS } from "../../../src/config/persistence/schemaVersions.config";
import {
  clickTabByAnyOf,
  findPlayerPage,
  invoke,
  sleep,
  TAB,
  waitForReady,
} from "../cdp";
import type { Scenario } from "../harness";

export const streaming: Scenario = {
  name: "streaming",
  async run({ browser, page, step, skip, outDir }) {
    await step("enable streaming in isolated settings", async () => {
      await page.evaluate((sv) => {
        const key = "iluha.v1.settings";
        const raw = localStorage.getItem(key);
        const envelope = raw
          ? (JSON.parse(raw) as { data: Record<string, unknown> })
          : { f: 1, store: "settings", sv, data: {} };
        envelope.data = {
          ...envelope.data,
          streamTabEnabled: true,
          playerPrewarmEnabled: true,
        };
        localStorage.setItem(key, JSON.stringify(envelope));
      }, SCHEMA_VERSIONS.settings);
      await page.reload();
      await waitForReady(page);
      await invoke(page, "plugin:window|set_focus", { label: "main" });
      await clickTabByAnyOf(page, ["Стриминг", "Streaming", "Stream"]);
    });
    await step("hidden player prewarm does not take focus", async () => {
      await invoke(page, "player_prewarm");
      await sleep(500);

      if (
        !(await invoke<boolean>(page, "plugin:window|is_focused", {
          label: "main",
        }))
      ) {
        throw new Error("hidden prewarm took focus from the main window");
      }
    });
    await step("sort controls fit their visible row", async () => {
      const bar = page.getByRole("region", { name: "Сортировка", exact: true });
      await bar.waitFor();
      await page.screenshot({ path: join(outDir, "streaming-wide.png") });
      const clipped = await bar
        .locator("button[aria-current]")
        .evaluateAll((buttons) =>
          buttons.some((button) => {
            const b = button.getBoundingClientRect();
            const p = button.parentElement?.getBoundingClientRect();

            return (
              p !== undefined && (b.right > p.right + 1 || b.left < p.left - 1)
            );
          }),
        );

      if (clipped) throw new Error("active sort button is clipped");
    });
    await step("narrow sort row keeps buttons inside its clip", async () => {
      const bar = page
        .locator("section[aria-label]")
        .filter({ has: page.locator("button[aria-current]") });
      await bar.evaluate((element) => {
        element.style.width = "220px";
      });

      try {
        await sleep(200);
        const clipped = await bar
          .locator("button[aria-current]")
          .evaluateAll((buttons) =>
            buttons.some((button) => {
              const outer = button.parentElement?.getBoundingClientRect();
              const inner = button.getBoundingClientRect();

              return outer !== undefined && inner.right > outer.right + 1;
            }),
          );

        if (clipped) throw new Error("narrow row clips the active sort button");
        await page.screenshot({
          path: join(outDir, "streaming-narrow-sort.png"),
        });
      } finally {
        await bar.evaluate((element) => {
          element.style.width = "";
        });
        await sleep(200);
      }
    });
    await step("switch source and sort AllAnime catalog", async () => {
      await page.getByRole("combobox").first().click();
      await page.getByRole("option", { name: "AllAnime", exact: true }).click();
      await page
        .getByRole("region", { name: "Сортировка", exact: true })
        .waitFor();
      await page.getByRole("button", { name: "Название", exact: true }).click();
      await page
        .locator("[data-stream-card]")
        .first()
        .waitFor({ timeout: 45000 });

      if (
        await page
          .getByRole("button", { name: "Случайное", exact: true })
          .count()
      )
        throw new Error("AllAnime exposes unsupported random action");
      await page.screenshot({ path: join(outDir, "streaming-allanime.png") });
    });
    await step("AllAnime title opens and exposes episodes", async () => {
      await page.locator("[data-main-search]").fill("Frieren");
      await page.locator("[data-main-search]").press("Enter");
      await page
        .getByRole("button", { name: "Sousou no Frieren", exact: true })
        .waitFor({ timeout: 45000 });
      await page
        .getByRole("button", { name: "Sousou no Frieren", exact: true })
        .click();
      await page
        .locator("[data-stream-episode]")
        .first()
        .waitFor({ timeout: 45000 });
      await page
        .getByText("The Journey's End", { exact: true })
        .waitFor({ timeout: 15000 });
      const cover = page
        .getByRole("dialog")
        .getByRole("img", { name: "Sousou no Frieren", exact: true });
      await cover.waitFor({ timeout: 15000 });
      await cover.evaluate(async (element) => {
        if (!(element instanceof HTMLImageElement))
          throw new TypeError("cover is not an image");
        await element.decode();

        if (element.naturalWidth === 0) throw new Error("cover did not load");
      });
      await page.screenshot({ path: join(outDir, "streaming-detail.png") });
      await page.keyboard.press("Escape");
    });
    await step(
      "integrations contain one AnimeLib proxy and no account section",
      async () => {
        await clickTabByAnyOf(page, TAB.settings);
        await page
          .getByRole("button", { name: "Интеграции", exact: true })
          .click();
        await page.locator('[data-find-section="proxy.stream"]').waitFor();

        if (await page.locator('[data-find-section="proxy.animelib"]').count())
          throw new Error("duplicate account section remains");
      },
    );

    let sourcesAvailable = false;
    await step(
      "live AllAnime sources survive immediate concurrent requests",
      async () => {
        const search = await invoke<{ items: { id: string }[] }>(
          page,
          "allanime_search",
          { input: { query: "Frieren", page: 1 } },
        );
        const anime = search.items[0];

        if (!anime) throw new Error("AllAnime search is empty");
        const title = await invoke<{ episodes: { id: string }[] }>(
          page,
          "allanime_title",
          { input: { slug: anime.id } },
        );
        const episode = title.episodes[0];

        if (!episode) throw new Error("AllAnime title has no episodes");
        const [players] = await Promise.all([
          invoke<{ id: string; player: string }[]>(page, "allanime_players", {
            input: { episodeId: episode.id },
          }),
          invoke<{ id: string; player: string }[]>(page, "allanime_players", {
            input: { episodeId: episode.id },
          }),
        ]);
        let playable = false;

        for (const player of players) {
          const sources = await invoke<{ url: string }[]>(
            page,
            "allanime_stream_sources",
            {
              input: {
                episodeId: episode.id,
                variantId: `${player.player}:${player.id}`,
              },
            },
          ).catch(() => []);

          if (sources.some((source) => /^https?:/.test(source.url))) {
            playable = true;
            break;
          }
        }

        if (!playable) throw new Error("AllAnime returned no playable source");
        sourcesAvailable = true;
      },
    ).catch(() => undefined);

    if (!sourcesAvailable) {
      await skip(
        "episode opens in mpv and loads video metadata",
        "source resolution failed; see the live source step",
      );

      return;
    }

    await clickTabByAnyOf(page, ["Стриминг", "Streaming", "Stream"]);
    await step("episode opens in mpv and loads video metadata", async () => {
      await page
        .getByRole("button", { name: "Sousou no Frieren", exact: true })
        .click();
      await page
        .locator("[data-stream-episode]")
        .first()
        .waitFor({ timeout: 45000 });
      const warmPlayer = await findPlayerPage(browser, 15000);
      const initiallyLocked = await warmPlayer
        .locator("[data-player-controls]")
        .evaluate(
          (element) =>
            element instanceof HTMLFieldSetElement &&
            element.disabled &&
            element.hasAttribute("inert"),
        );

      if (!initiallyLocked)
        throw new Error(
          "playback controls are enabled before the first file load",
        );
      await page.locator("[data-stream-episode]").first().click();
      const player = await findPlayerPage(browser, 90000);

      try {
        const deadline = Date.now() + 60000;
        let loaded = false;

        while (Date.now() < deadline) {
          const duration = await invoke<number | null>(
            player,
            "player_get_property",
            { name: "duration", format: "double" },
          ).catch(() => null);

          if (typeof duration === "number" && duration > 0) {
            loaded = true;
            break;
          }

          await sleep(500);
        }

        if (!loaded) throw new Error("mpv did not load the episode");
        await player.waitForFunction(
          () => {
            const controls = document.querySelector("[data-player-controls]");

            return (
              controls instanceof HTMLFieldSetElement &&
              !controls.disabled &&
              !controls.hasAttribute("inert")
            );
          },
          undefined,
          { timeout: 15000 },
        );
        await player.screenshot({ path: join(outDir, "streaming-player.png") });
        const calls = await player.evaluate(() => {
          const stats =
            (
              window as unknown as {
                __iluhaTransportStats?: () => Array<{
                  command: string;
                  invokes: number;
                }>;
              }
            ).__iluhaTransportStats?.() ?? [];

          return stats
            .filter((stat) =>
              ["allanime_players", "allanime_stream_sources"].includes(
                stat.command,
              ),
            )
            .reduce((count, stat) => count + stat.invokes, 0);
        });

        if (calls !== 0)
          throw new Error("player repeated the catalog playback resolution");
        const stream = await player.evaluate(async () => {
          const path = "/src/store/player.store.ts";
          const store = (await import(path)) as {
            streamSession: { get: () => unknown };
          };

          return store.streamSession.get();
        });
        await invoke(page, "plugin:window|set_focus", { label: "main" });
        await invoke(player, "player_open_stream", { stream });
        await sleep(500);

        if (
          !(await invoke<boolean>(page, "plugin:window|is_focused", {
            label: "main",
          }))
        ) {
          throw new Error(
            "an internal stream reload took focus from the main window",
          );
        }
      } finally {
        await invoke(player, "player_close_window").catch((error: unknown) => {
          if (!player.isClosed()) throw error;
        });
      }

      await page.keyboard.press("Escape");
    });
  },
};
