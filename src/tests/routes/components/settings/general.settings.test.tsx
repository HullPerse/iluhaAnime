import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import SettingsGeneral from "@/routes/components/settings/general.settings";
import { useSettingsStore } from "@/store/settings.store";

const mockInvoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

afterEach(() => {
  cleanup();
  mockInvoke.mockReset();
});

beforeEach(() => {
  useSettingsStore.setState({ anilistProxyUrl: null, language: "en" });
});

function anilistSection() {
  const title = screen
    .getAllByText("AniList proxy")
    .find((el) => el.closest(".ui-titlebar"));
  const section = title?.closest("section");
  if (!section) throw new Error("AniList section missing");
  return section;
}
describe("SettingsGeneral AniList proxy", () => {
  it("tests site plus API and reports the combined result", async () => {
    mockInvoke.mockResolvedValueOnce("OK site 12ms, API 34ms (#21 One Piece)");
    render(<SettingsGeneral />);
    fireEvent.click(
      within(anilistSection()).getByRole("button", { name: "Test connection" })
    );
    expect(mockInvoke).toHaveBeenCalledWith("test_anilist_connection", {});
    await screen.findByText(/AniList reachable/);
  });

  it("surfaces a failed API check", async () => {
    mockInvoke.mockRejectedValueOnce(new Error("API check failed: HTTP 403 after 10ms"));
    render(<SettingsGeneral />);
    fireEvent.click(
      within(anilistSection()).getByRole("button", { name: "Test connection" })
    );
    await screen.findByText(/Failed:/);
  });
});
