import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TorrentDiagnosticsSection } from "@/routes/components/torrent/sections/diagnostics.sections";
import { useSettingsStore } from "@/store/settings.store";

const mockInvoke = vi.fn();
const writeTextSpy = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({
  writeText: (...args: unknown[]) => writeTextSpy(...args),
}));

function renderSection(enabled = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <TorrentDiagnosticsSection id={7} infoHash="abc" enabled={enabled} />
    </QueryClientProvider>
  );
}

afterEach(() => cleanup());

beforeEach(() => {
  useSettingsStore.setState({ language: "en" });
  mockInvoke.mockReset();
  writeTextSpy.mockReset();
  writeTextSpy.mockResolvedValue(undefined);
});

describe("TorrentDiagnosticsSection", () => {
  it("renders peers and trackers", async () => {
    mockInvoke.mockResolvedValue({
      id: 7,
      peers: [
        {
          addr: "1.2.3.4:6881",
          state: "live",
          client_name: "qBittorrent",
          down_bytes: 1024,
          up_bytes: 0,
          errors: 0,
        },
      ],
      trackers: ["udp://tracker.example:1337/announce"],
    });
    renderSection();

    expect(await screen.findByText("1.2.3.4:6881")).toBeTruthy();
    expect(screen.getByText("qBittorrent", { exact: false })).toBeTruthy();
    expect(screen.getByText("udp://tracker.example:1337/announce")).toBeTruthy();
  });

  it("explains an empty swarm", async () => {
    mockInvoke.mockResolvedValue({ id: 7, peers: [], trackers: [] });
    renderSection();

    expect(await screen.findByText(/No connected peers/)).toBeTruthy();
  });

  it("renders nothing when disabled", () => {
    const { container } = renderSection(false);
    expect(container.textContent).toBe("");
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("copies the magnet link", async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ id: 7, peers: [], trackers: [] });
    renderSection();

    await user.click(await screen.findByTitle("Copy magnet"));

    expect(writeTextSpy).toHaveBeenCalledWith("magnet:?xt=urn:btih:abc");
  });

  it("copies the info-hash", async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ id: 7, peers: [], trackers: [] });
    renderSection();

    await user.click(await screen.findByTitle("Copy info-hash"));

    expect(writeTextSpy).toHaveBeenCalledWith("abc");
  });
});
