import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import SettingsTorrent from "@/routes/components/settings/torrent.settings";
import { useSettingsStore } from "@/store/settings.store";

const mockInvoke = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
  convertFileSrc: (path: string) => `http://asset.localhost/${encodeURIComponent(path)}`,
}));

afterEach(() => cleanup());

beforeEach(() => {
  useSettingsStore.setState({
    language: "en",
    listenPort: 0,
    peerConnectTimeout: 30,
    peerReadWriteTimeout: 30,
    torrentProxyUrl: null,
  });
  mockInvoke.mockReset();
  mockInvoke.mockImplementation((command: string) => {
    if (command === "torrent_listen_port") return Promise.resolve(51413);
    return Promise.resolve(undefined);
  });
});

function renderSettings() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <SettingsTorrent />
    </QueryClientProvider>
  );
}

describe("SettingsTorrent network section", () => {
  it("saves valid network values through the session config", async () => {
    const user = userEvent.setup();
    renderSettings();

    const portInput = screen.getByDisplayValue("0");
    await user.clear(portInput);
    await user.type(portInput, "6881");
    await user.click(screen.getByRole("button", { name: "Apply" }));

    const saveCall = mockInvoke.mock.calls.find((call) => call[0] === "save_session_config");
    expect(saveCall?.[1]).toMatchObject({ config: { listenPort: 6881 } });
  });

  it("rejects invalid numbers without saving", async () => {
    const user = userEvent.setup();
    renderSettings();

    const portInput = screen.getByDisplayValue("0");
    await user.clear(portInput);
    await user.type(portInput, "99999");
    await user.click(screen.getByRole("button", { name: "Apply" }));

    expect(screen.getByText("Enter valid numbers")).toBeTruthy();
    expect(mockInvoke.mock.calls.some((call) => call[0] === "save_session_config")).toBe(false);
  });

  it("saves the torrent proxy alongside the other network values", async () => {
    const user = userEvent.setup();
    renderSettings();

    const proxyInput = screen.getByPlaceholderText("socks5://127.0.0.1:10808");
    await user.type(proxyInput, "socks5://127.0.0.1:10808");
    await user.click(screen.getByRole("button", { name: "Apply" }));

    const saveCall = mockInvoke.mock.calls.find((call) => call[0] === "save_session_config");
    expect(saveCall?.[1]).toMatchObject({
      config: { proxyUrl: "socks5://127.0.0.1:10808" },
    });
  });

  it("clears the stored proxy when the field is emptied", async () => {
    const user = userEvent.setup();
    useSettingsStore.setState({ torrentProxyUrl: "socks5://127.0.0.1:10808" });
    renderSettings();

    await user.clear(screen.getByDisplayValue("socks5://127.0.0.1:10808"));
    await user.click(screen.getByRole("button", { name: "Apply" }));

    const saveCall = mockInvoke.mock.calls.find((call) => call[0] === "save_session_config");
    expect(saveCall?.[1]).toMatchObject({ config: { proxyUrl: null } });
  });

  it("shows the proxy response time after a successful test", async () => {
    const user = userEvent.setup();
    mockInvoke.mockImplementation((command: string) => {
      if (command === "torrent_listen_port") return Promise.resolve(51413);
      if (command === "test_source_connection") return Promise.resolve("OK 87ms (HTTP 200)");
      return Promise.resolve(undefined);
    });
    renderSettings();

    await user.type(screen.getByPlaceholderText("socks5://127.0.0.1:10808"), "socks5://1.2.3.4:1");
    await user.click(screen.getByRole("button", { name: "Test connection" }));

    expect(await screen.findByText("Proxy works - OK 87ms (HTTP 200)")).toBeTruthy();
    expect(mockInvoke).toHaveBeenCalledWith("test_source_connection", {
      source: "nyaa",
      proxyUrl: "socks5://1.2.3.4:1",
      proxy_url: "socks5://1.2.3.4:1",
    });
  });

  it("reports why a proxy test failed", async () => {
    const user = userEvent.setup();
    mockInvoke.mockImplementation((command: string) => {
      if (command === "torrent_listen_port") return Promise.resolve(51413);
      if (command === "test_source_connection")
        return Promise.reject(new Error("Proxy error: connection refused"));
      return Promise.resolve(undefined);
    });
    renderSettings();

    await user.click(screen.getByRole("button", { name: "Test connection" }));

    expect(await screen.findByText("Failed: Proxy error: connection refused")).toBeTruthy();
  });

  it("shows the port the session actually bound", async () => {
    renderSettings();

    expect(await screen.findByText("Session bound port 51413")).toBeTruthy();
  });

  it("says the session is idle when no port is bound", async () => {
    mockInvoke.mockImplementation((command: string) => {
      if (command === "torrent_listen_port") return Promise.resolve(null);
      return Promise.resolve(undefined);
    });
    renderSettings();

    expect(await screen.findByText("Session is not running")).toBeTruthy();
  });
});
