import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TorrentPeersModal } from "@/routes/components/torrent/peers.torrent";
import { useSettingsStore } from "@/store/settings.store";

const mockInvoke = vi.fn();
const writeTextSpy = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
  convertFileSrc: (path: string) => `http://asset.localhost/${encodeURIComponent(path)}`,
}));

vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({
  writeText: (...args: unknown[]) => writeTextSpy(...args),
}));

function renderModal() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <TorrentPeersModal id={7} infoHash="abc" open onClose={() => {}} />
    </QueryClientProvider>
  );
}

afterEach(() => cleanup());

beforeEach(() => {
  useSettingsStore.setState({ language: "en" });
  mockInvoke.mockReset();
  writeTextSpy.mockReset();
  writeTextSpy.mockResolvedValue(undefined);
  mockInvoke.mockResolvedValue({ id: 7, peers: [], trackers: [] });
});

describe("TorrentPeersModal", () => {
  it("renders peer rows with split address and connection", async () => {
    mockInvoke.mockResolvedValue({
      id: 7,
      peers: [
        {
          addr: "1.2.3.4:6881",
          country: "DE",
          state: "live",
          client_name: "qBittorrent",
          conn_kind: "tcp",
          down_bytes: 1024,
          up_bytes: 0,
          errors: 0,
        },
      ],
      trackers: [],
    });
    renderModal();

    expect(await screen.findByText("1.2.3.4:6881")).toBeTruthy();
    expect(screen.getByText("qBittorrent")).toBeTruthy();
    expect(screen.getByText("tcp")).toBeTruthy();
    expect(screen.getByLabelText("DE")).toBeTruthy();
  });

  it("splits an IPv6 address and flags peer errors", async () => {
    mockInvoke.mockResolvedValue({
      id: 7,
      peers: [
        {
          addr: "[2001:db8::1]:6881",
          country: null,
          state: "live",
          client_name: null,
          conn_kind: "utp",
          down_bytes: 0,
          up_bytes: 0,
          errors: 3,
        },
      ],
      trackers: [],
    });
    renderModal();

    expect(await screen.findByText("[2001:db8::1]:6881")).toBeTruthy();
    expect(screen.getByText("E3")).toBeTruthy();
  });

  it("explains an empty swarm", async () => {
    renderModal();
    expect(await screen.findByText(/No connected peers/)).toBeTruthy();
  });

  it("renders nothing when closed", () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { container } = render(
      <QueryClientProvider client={client}>
        <TorrentPeersModal id={7} infoHash="abc" open={false} onClose={() => {}} />
      </QueryClientProvider>
    );
    expect(container.textContent).toBe("");
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("copies the magnet link", async () => {
    const user = userEvent.setup();
    renderModal();
    await user.click(await screen.findByTitle("Copy magnet"));
    expect(writeTextSpy).toHaveBeenCalledWith("magnet:?xt=urn:btih:abc");
  });

  it("copies the app link for the torrent", async () => {
    const user = userEvent.setup();
    renderModal();
    await user.click(await screen.findByTitle("Copy app link"));
    expect(writeTextSpy).toHaveBeenCalledWith("iluhaanime://torrent/abc");
  });

  it("adds a tracker from the trackers tab", async () => {
    const user = userEvent.setup();
    renderModal();
    await user.click(await screen.findByRole("tab", { name: /Trackers/ }));
    const input = await screen.findByPlaceholderText("udp://tracker:port/announce");
    await user.type(input, "udp://new.tracker:1337/announce");
    await user.click(screen.getByTitle("Add"));
    expect(mockInvoke).toHaveBeenCalledWith("add_torrent_tracker", {
      id: 7,
      tracker: "udp://new.tracker:1337/announce",
      // Same camelCase rule as `remove_torrent`'s `deleteFiles`: the Rust param is `info_hash`.
      infoHash: "abc",
    });
  });

  it("removes a tracker from the trackers tab", async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({
      id: 7,
      peers: [],
      trackers: ["udp://old.tracker:1337/announce"],
    });
    renderModal();
    await user.click(await screen.findByRole("tab", { name: /Trackers/ }));
    await user.click(
      await screen.findByRole("button", {
        name: "Remove tracker: udp://old.tracker:1337/announce",
      })
    );
    expect(mockInvoke).toHaveBeenCalledWith("remove_torrent_tracker", {
      id: 7,
      tracker: "udp://old.tracker:1337/announce",
      // Tauri v2 looks the argument up as the camelCase of the Rust parameter (`info_hash`).
      infoHash: "abc",
    });
  });
});
