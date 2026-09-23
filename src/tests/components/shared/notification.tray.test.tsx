import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import NotificationTray from "@/components/shared/notification/tray.notification";
import { useDeepLinkStore } from "@/store/deeplink.store";
import { useNotificationStore } from "@/store/notification.store";
import { useSettingsStore } from "@/store/settings.store";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: () => Promise.resolve(),
}));

const openPathSpy = vi.fn((..._args: unknown[]) => Promise.resolve());

vi.mock("@tauri-apps/plugin-opener", () => ({
  openPath: (...args: unknown[]) => openPathSpy(...args),
}));

vi.mock("@/hooks/torrent/queries.hook", () => ({
  useTorrents: () => ({ data: [] }),
}));

const OPEN_LABEL = "Открыть карточку аниме";
const PANEL_LABEL = "Уведомления";

beforeEach(() => {
  useNotificationStore.setState({ dismissed: [], items: [], unreadCount: 0 });
  useDeepLinkStore.setState({ target: null });
  useSettingsStore.setState({
    anilistTabEnabled: true,
    language: "ru",
    notificationsEnabled: false,
  });
  openPathSpy.mockReset();
  openPathSpy.mockResolvedValue(undefined);
});

afterEach(cleanup);

async function openPanel(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: PANEL_LABEL }));
}

function addEpisode(title: string, animeId: number) {
  useNotificationStore
    .getState()
    .add("Вышел новый эпизод", "info", `${title}, эпизод 3`, `${animeId}:3`, {
      system: false,
      target: { source: "anilist", id: animeId },
    });
}

describe("NotificationTray navigation", () => {
  it("opens the linked anime and closes the panel", async () => {
    const user = userEvent.setup();
    addEpisode("One Piece", 21);
    render(<NotificationTray />);
    await openPanel(user);

    await user.click(screen.getByTitle(OPEN_LABEL));

    expect(useDeepLinkStore.getState().target).toEqual({ source: "anilist", id: 21 });
    expect(screen.queryByRole("region", { name: PANEL_LABEL })).toBeNull();
  });

  it("opens the anime from the keyboard", async () => {
    const user = userEvent.setup();
    addEpisode("One Piece", 21);
    render(<NotificationTray />);
    await openPanel(user);

    const row = screen.getByTitle(OPEN_LABEL);
    row.focus();
    await user.keyboard("{Enter}");

    expect(useDeepLinkStore.getState().target).toEqual({ source: "anilist", id: 21 });
  });

  it("only marks read when the row has no target", async () => {
    const user = userEvent.setup();
    useNotificationStore.getState().add("Backlog ready", "info", "Found at startup", "backlog", {
      system: false,
    });
    render(<NotificationTray />);
    await openPanel(user);

    expect(screen.queryByTitle(OPEN_LABEL)).toBeNull();
    await user.click(screen.getByText("Backlog ready"));

    expect(useDeepLinkStore.getState().target).toBeNull();
    expect(useNotificationStore.getState().items[0].read).toBe(true);
  });

  it("reveals the download folder for a torrent notification", async () => {
    const user = userEvent.setup();
    useNotificationStore
      .getState()
      .add("Загрузка завершена", "success", "Anime", "torrent-complete:1:abc", {
        system: false,
        target: { source: "folder", path: "D:\\Anime\\Show" },
      });
    render(<NotificationTray />);
    await openPanel(user);

    await user.click(screen.getByTitle(OPEN_LABEL));

    expect(openPathSpy).toHaveBeenCalledWith("D:\\Anime\\Show");
    expect(useDeepLinkStore.getState().target).toBeNull();
    expect(screen.queryByRole("region", { name: PANEL_LABEL })).toBeNull();
  });

  it("reports an error instead of navigating when the anime tab is disabled", async () => {
    const user = userEvent.setup();
    useSettingsStore.setState({ anilistTabEnabled: false });
    addEpisode("One Piece", 21);
    render(<NotificationTray />);
    await openPanel(user);

    await user.click(screen.getByTitle(OPEN_LABEL));

    expect(useDeepLinkStore.getState().target).toBeNull();
    expect(useNotificationStore.getState().items[0].type).toBe("error");
  });
});
