// Boot scenario: app opens, tabs render, no console errors, screenshot.
// The harness reloads the page before scenarios run so this captures a real
// cold mount with listeners attached.

import { TAB, clickTabByAnyOf, tabLabels, waitForReady } from "../cdp";
import type { Scenario } from "../harness";

const RU_LOGIN = "\u0412\u043E\u0439\u0434\u0438\u0442\u0435";
const RU_SUMMARY = "\u0421\u0432\u043E\u0434\u043A\u0430";

export const boot: Scenario = {
  name: "boot",
  async run({ page, step }) {
    await step("app renders tab strip", async () => {
      await waitForReady(page);
      const labels = await tabLabels(page);
      if (labels.length < 4) throw new Error(`expected at least 4 tabs, got ${labels.length}`);
    });

    await step("anilist tab switches", async () => {
      await clickTabByAnyOf(page, TAB.anilist);
      // No credentials are configured for e2e, so the tab must land on the
      // login-required state rather than silently showing data.
      const login = page.locator(`text=/${RU_LOGIN}|log ?in|sign ?in/i`).first();
      const found = await login
        .waitFor({ timeout: 15_000 })
        .then(() => true)
        .catch(() => false);
      if (!found) throw new Error("expected a login prompt on the AniList tab");
    });

    await step("settings tab opens", async () => {
      await clickTabByAnyOf(page, TAB.settings);
      const summary = page.locator(`text=/summary|${RU_SUMMARY}/i`).first();
      const found = await summary
        .waitFor({ timeout: 15_000 })
        .then(() => true)
        .catch(() => false);
      if (!found) throw new Error("settings summary did not render");
    });
  },
};
