import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import SettingsTorrent from "@/routes/components/settings/torrent.settings";
import { useSettingsStore } from "@/store/settings.store";

const mockInvoke = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

afterEach(() => cleanup());

beforeEach(() => {
  useSettingsStore.setState({
    language: "en",
    listenPort: 0,
    peerConnectTimeout: 30,
    peerReadWriteTimeout: 30,
  });
  mockInvoke.mockReset();
  mockInvoke.mockResolvedValue(undefined);
});

describe("SettingsTorrent network section", () => {
  it("saves valid network values through the session config", async () => {
    const user = userEvent.setup();
    render(<SettingsTorrent />);

    const portInput = screen.getByDisplayValue("0");
    await user.clear(portInput);
    await user.type(portInput, "6881");
    await user.click(screen.getByRole("button", { name: "Apply" }));

    const saveCall = mockInvoke.mock.calls.find((call) => call[0] === "save_session_config");
    expect(saveCall?.[1]).toMatchObject({ config: { listenPort: 6881 } });
  });

  it("rejects invalid numbers without saving", async () => {
    const user = userEvent.setup();
    render(<SettingsTorrent />);

    const portInput = screen.getByDisplayValue("0");
    await user.clear(portInput);
    await user.type(portInput, "99999");
    await user.click(screen.getByRole("button", { name: "Apply" }));

    expect(screen.getByText("Enter valid numbers")).toBeTruthy();
    expect(mockInvoke.mock.calls.some((call) => call[0] === "save_session_config")).toBe(false);
  });
});
