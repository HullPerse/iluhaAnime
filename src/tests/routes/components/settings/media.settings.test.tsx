import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { DEFAULT_SETTINGS } from "@/config/settings/defaults.config";
import SettingsMedia from "@/routes/components/settings/media.settings";
import { useSettingsStore } from "@/store/settings.store";

afterEach(() => cleanup());

beforeEach(() => {
  useSettingsStore.setState({
    language: "en",
    videoExtensions: [...DEFAULT_SETTINGS.videoExtensions],
    audioExtensions: [...DEFAULT_SETTINGS.audioExtensions],
    subtitleExtensions: [...DEFAULT_SETTINGS.subtitleExtensions],
  });
});

describe("SettingsMedia", () => {
  it("commits a normalized extension list on blur", async () => {
    const user = userEvent.setup();
    render(<SettingsMedia />);

    const input = screen.getByDisplayValue(DEFAULT_SETTINGS.videoExtensions.join(", "));
    await user.clear(input);
    await user.type(input, "MP4, .WEBM avi");
    await user.tab();

    expect(useSettingsStore.getState().videoExtensions).toEqual(["mp4", "webm", "avi"]);
  });

  it("rejects an empty list and keeps the stored value", async () => {
    const user = userEvent.setup();
    render(<SettingsMedia />);

    const input = screen.getByDisplayValue(DEFAULT_SETTINGS.audioExtensions.join(", "));
    await user.clear(input);
    await user.tab();

    expect(screen.getByText("List cannot be empty")).toBeTruthy();
    expect(useSettingsStore.getState().audioExtensions).toEqual(DEFAULT_SETTINGS.audioExtensions);
  });

  it("resets all lists to defaults", async () => {
    const user = userEvent.setup();
    useSettingsStore.setState({ videoExtensions: ["mkv"] });
    render(<SettingsMedia />);

    await user.click(screen.getByRole("button", { name: "Reset to defaults" }));

    expect(useSettingsStore.getState().videoExtensions).toEqual(DEFAULT_SETTINGS.videoExtensions);
  });
});
