import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import CreateTorrentModal from "@/routes/components/torrent/create.torrent";
import { useSettingsStore } from "@/store/settings.store";

// Hoisted: the mocked modules are pulled in while the settings store hydrates at import time.
const { mockInvoke, openSpy, saveSpy, writeTextSpy } = vi.hoisted(() => ({
  mockInvoke: vi.fn(),
  openSpy: vi.fn(),
  saveSpy: vi.fn(),
  writeTextSpy: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
  convertFileSrc: (path: string) => `http://asset.localhost/${encodeURIComponent(path)}`,
}));

vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({
  writeText: (...args: unknown[]) => writeTextSpy(...args),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: (...args: unknown[]) => openSpy(...args),
  save: (...args: unknown[]) => saveSpy(...args),
}));

// Creating a torrent reports it through the notification store, which would otherwise reach for a
// system toast that jsdom cannot construct.
vi.mock("@tauri-apps/plugin-notification", () => ({ sendNotification: () => {} }));

const CREATED = {
  file_count: 12,
  id: 3,
  info_hash: "abc123",
  name: "Show",
  torrent_path: "C:/app/created_torrents/abc123.torrent",
};

function renderModal(overrides: { onCreated?: (created: unknown) => void } = {}) {
  return render(
    <CreateTorrentModal open onClose={() => {}} onCreated={overrides.onCreated ?? (() => {})} />
  );
}

/** Picks a folder and runs the whole create step, leaving the modal on its result view. */
async function createTorrent(user: ReturnType<typeof userEvent.setup>, folder = "D:/Anime/Show") {
  openSpy.mockResolvedValue(folder);
  await user.click(screen.getByRole("button", { name: "Browse" }));
  await user.click(screen.getByRole("button", { name: "Create" }));
  await screen.findByDisplayValue("abc123");
}

afterEach(() => cleanup());

beforeEach(() => {
  useSettingsStore.setState({ language: "en" });
  mockInvoke.mockReset();
  writeTextSpy.mockReset();
  writeTextSpy.mockResolvedValue(undefined);
  openSpy.mockReset();
  saveSpy.mockReset();
  saveSpy.mockResolvedValue(null);
});

describe("CreateTorrentModal", () => {
  it("creates a torrent from the picked folder and reports it once", async () => {
    const user = userEvent.setup();
    const onCreated = vi.fn();
    mockInvoke.mockResolvedValue(CREATED);
    renderModal({ onCreated });

    openSpy.mockResolvedValue("D:/Anime/Show");
    await user.click(screen.getByRole("button", { name: "Browse" }));
    expect(screen.getByDisplayValue("D:/Anime/Show")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Create" }));

    expect(await screen.findByDisplayValue("abc123")).toBeTruthy();
    expect(mockInvoke).toHaveBeenCalledWith("create_torrent_from_folder", {
      sourceDir: "D:/Anime/Show",
    });
    expect(screen.getByDisplayValue("iluhaanime://torrent/abc123")).toBeTruthy();
    expect(screen.getByText("Files in the torrent: 12")).toBeTruthy();
    expect(onCreated).toHaveBeenCalledTimes(1);
    // The route needs the id to mark the torrent as one the user wants to keep seeding.
    expect(onCreated).toHaveBeenCalledWith(CREATED);
  });

  it("will not create without a folder", async () => {
    renderModal();
    expect((screen.getByRole("button", { name: "Create" }) as HTMLButtonElement).disabled).toBe(
      true
    );
  });

  it("keeps the folder dialog cancel harmless", async () => {
    const user = userEvent.setup();
    openSpy.mockResolvedValue(null);
    renderModal();

    await user.click(screen.getByRole("button", { name: "Browse" }));

    expect((screen.getByRole("button", { name: "Create" }) as HTMLButtonElement).disabled).toBe(
      true
    );
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("copies the app link, not just the hash", async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue(CREATED);
    renderModal();
    await createTorrent(user);

    await user.click(screen.getByTitle("Copy app link"));

    expect(writeTextSpy).toHaveBeenCalledWith("iluhaanime://torrent/abc123");
  });

  it("saves the stored metainfo copy to the chosen path", async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue(CREATED);
    saveSpy.mockResolvedValue("D:/out/Show.torrent");
    renderModal();
    await createTorrent(user);

    await user.click(screen.getByTitle("Save .torrent"));

    expect(saveSpy).toHaveBeenCalledWith({
      defaultPath: "Show.torrent",
      filters: [{ name: "Torrent", extensions: ["torrent"] }],
    });
    expect(mockInvoke).toHaveBeenLastCalledWith("save_created_torrent", {
      from: "C:/app/created_torrents/abc123.torrent",
      to: "D:/out/Show.torrent",
    });
  });

  it("does not copy anything when the save dialog is dismissed", async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue(CREATED);
    saveSpy.mockResolvedValue(null);
    renderModal();
    await createTorrent(user);

    await user.click(screen.getByTitle("Save .torrent"));

    expect(mockInvoke).toHaveBeenCalledTimes(1);
  });

  it("renders nothing when closed", () => {
    const { container } = render(
      <CreateTorrentModal open={false} onClose={() => {}} onCreated={() => {}} />
    );
    expect(container.textContent).toBe("");
  });
});
