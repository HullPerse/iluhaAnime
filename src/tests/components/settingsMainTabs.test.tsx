import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import MainTabsSettings from "@/routes/components/settings/mainTabs.settings";
import { tr } from "@/lib/locale/i18n.utils";
import { patchSettings, settingsAtoms } from "@/store/settings.store";

afterEach(() => {
  cleanup();
  patchSettings({ mainTabOrder: [], anilistTabEnabled: true });
});

it("keeps required tabs checked and disabled while optional tabs can be toggled", () => {
  render(<MainTabsSettings />);

  for (const key of ["app.search", "app.torrent", "app.player", "app.settings"] as const) {
    const checkbox = screen.getByRole("checkbox", { name: tr(key) });
    expect(checkbox.getAttribute("aria-checked")).toBe("true");
    expect(checkbox.hasAttribute("disabled") || checkbox.getAttribute("aria-disabled") === "true").toBe(true);
  }

  fireEvent.click(screen.getByRole("checkbox", { name: tr("app.anilist") }));
  expect(settingsAtoms.anilistTabEnabled.get()).toBe(false);
});

it("renders the saved tab order with only drag handles", () => {
  patchSettings({ mainTabOrder: ["torrent", "search"] });
  render(<MainTabsSettings />);
  const checkboxes = screen.getAllByRole("checkbox");
  expect(checkboxes[0]?.getAttribute("aria-label")).toBe(tr("app.torrent"));
  expect(checkboxes[1]?.getAttribute("aria-label")).toBe(tr("app.search"));
  expect(checkboxes.length).toBeGreaterThanOrEqual(9);
  expect(screen.getAllByRole("button")).toHaveLength(checkboxes.length);
});
