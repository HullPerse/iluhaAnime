import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import AnimelibSettings from "@/routes/components/settings/animelib.settings";
import { patchSettings, settingsAtoms } from "@/store/settings.store";

import { mockInvoke } from "../../mocks";

beforeEach(() => {
  patchSettings({ language: "en", animelibProxyUrl: null });
});

afterEach(() => {
  cleanup();
});

describe("AnimelibSettings", () => {
  it("shows a stored token and removes it", async () => {
    mockInvoke.mockImplementation((command: string) => {
      if (command === "animelib_token_status") return Promise.resolve(true);
      if (command === "animelib_token_clear") return Promise.resolve(null);
      return Promise.resolve(null);
    });

    render(<AnimelibSettings />);

    await screen.findByText("Token stored in OS keyring");
    fireEvent.click(screen.getByRole("button", { name: "Remove token" }));

    await screen.findByText("No token saved");
    expect(mockInvoke).toHaveBeenCalledWith("animelib_token_clear", undefined);
  });

  it("saves a trimmed token and confirms it", async () => {
    mockInvoke.mockImplementation((command: string) => {
      if (command === "animelib_token_status") return Promise.resolve(false);
      if (command === "animelib_token_save") return Promise.resolve(null);
      return Promise.resolve(null);
    });

    render(<AnimelibSettings />);

    const input = await screen.findByLabelText("Session token");
    fireEvent.change(input, { target: { value: "  token.value  " } });
    fireEvent.click(screen.getByRole("button", { name: "Save token" }));

    await screen.findByText("Token verified and saved");
    expect(mockInvoke).toHaveBeenCalledWith("animelib_token_save", {
      token: "token.value",
    });
    expect(screen.getByText("Token stored in OS keyring")).toBeDefined();
  });

  it("stores and clears the AnimeLib proxy", async () => {
    mockInvoke.mockImplementation((command: string) => {
      if (command === "animelib_token_status") return Promise.resolve(false);
      return Promise.resolve(null);
    });

    render(<AnimelibSettings />);

    const input = screen.getByRole("textbox", { name: "Proxy" });
    fireEvent.change(input, { target: { value: "socks5://127.0.0.1:10808" } });
    expect(settingsAtoms.animelibProxyUrl.get()).toBe("socks5://127.0.0.1:10808");

    fireEvent.change(input, { target: { value: "" } });
    expect(settingsAtoms.animelibProxyUrl.get()).toBeNull();
  });

  it("shows the backend refusal and does not mark the token stored", async () => {
    mockInvoke.mockImplementation((command: string) => {
      if (command === "animelib_token_status") return Promise.resolve(false);
      if (command === "animelib_token_save") {
        return Promise.reject(new Error("AnimeLib rejected the token"));
      }
      return Promise.resolve(null);
    });

    render(<AnimelibSettings />);

    fireEvent.change(await screen.findByLabelText("Session token"), {
      target: { value: "expired" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save token" }));

    await screen.findByText("AnimeLib rejected the token");
    expect(screen.getByText("No token saved")).toBeDefined();
  });
});
