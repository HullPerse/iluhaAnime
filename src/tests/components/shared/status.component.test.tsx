import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";

import StatusBar from "@/components/shared/status.component";
import { useTorrentStore } from "@/store/download.store";
import { useNotificationStore } from "@/store/notification.store";
import { useSettingsStore } from "@/store/settings.store";

const openUrlSpy = vi.fn();

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: (...args: unknown[]) => openUrlSpy(...args),
}));

beforeEach(() => {
  useSettingsStore.setState({ language: "en" });
  useTorrentStore.setState({ torrents: [] });
  useNotificationStore.setState({ unreadCount: 0 });
  openUrlSpy.mockReset().mockResolvedValue(undefined);
});

afterEach(cleanup);

describe("StatusBar github links", () => {
  it("opens the project repository", async () => {
    const user = userEvent.setup();
    render(<StatusBar tabLabel="Search" />);
    await user.click(screen.getByRole("button", { name: "iluhaAnime" }));
    expect(openUrlSpy).toHaveBeenCalledWith("https://github.com/HullPerse/iluhaAnime");
  });

  it("opens the author profile", async () => {
    const user = userEvent.setup();
    render(<StatusBar tabLabel="Search" />);
    await user.click(screen.getByRole("button", { name: "HullPerse" }));
    expect(openUrlSpy).toHaveBeenCalledWith("https://github.com/HullPerse");
  });
});
