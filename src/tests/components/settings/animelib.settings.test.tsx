import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import AnimelibSettings from "@/routes/components/settings/animelib.settings";
import { patchSettings, settingsAtoms } from "@/store/settings.store";

import { mockInvoke } from "@/tests/mocks";

beforeEach(() => {
  patchSettings({ language: "en", animelibProxyUrl: null });
});

afterEach(() => {
  cleanup();
});

describe("AnimelibSettings", () => {
  it("shows a stored account and removes it", async () => {
    let stored = true;
    mockInvoke.mockImplementation((command: string) => {
      if (command === "animelib_account") {
        return Promise.resolve(
          stored ? { tokenSaved: true, login: "milky" } : { tokenSaved: false, login: null }
        );
      }
      if (command === "animelib_token_clear") {
        stored = false;
        return Promise.resolve(null);
      }
      return Promise.resolve(null);
    });

    render(<AnimelibSettings />);

    await screen.findByText("Signed in as milky");
    fireEvent.click(screen.getByRole("button", { name: "Remove token" }));

    await screen.findByText("Not signed in");
    expect(mockInvoke).toHaveBeenCalledWith("animelib_token_clear", undefined);
  });

  it("saves a trimmed token and shows the account behind it", async () => {
    let saved = false;
    mockInvoke.mockImplementation((command: string) => {
      if (command === "animelib_account") {
        return Promise.resolve(
          saved ? { tokenSaved: true, login: "milky" } : { tokenSaved: false, login: null }
        );
      }
      if (command === "animelib_token_save") {
        saved = true;
        return Promise.resolve(null);
      }
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
    expect(await screen.findByText("Signed in as milky")).toBeDefined();
  });

  it("marks a saved token that the session check rejects", async () => {
    mockInvoke.mockImplementation((command: string) => {
      if (command === "animelib_account") {
        return Promise.resolve({ tokenSaved: true, login: null });
      }
      return Promise.resolve(null);
    });

    render(<AnimelibSettings />);

    await screen.findByText("Token saved, but the session was rejected");
  });

  it("logs in through the site window and refreshes the account", async () => {
    let done = false;
    mockInvoke.mockImplementation((command: string) => {
      if (command === "animelib_account") {
        return Promise.resolve(
          done ? { tokenSaved: true, login: "milky" } : { tokenSaved: false, login: null }
        );
      }
      if (command === "animelib_webview_login") return Promise.resolve("ok");
      if (command === "animelib_finish_webview_login") {
        done = true;
        return Promise.resolve("ok");
      }
      return Promise.resolve(null);
    });

    render(<AnimelibSettings />);

    await screen.findByText("Not signed in");
    fireEvent.click(screen.getByRole("button", { name: "Sign in through AnimeLib" }));

    await screen.findByText("Signed in as milky");
    expect(mockInvoke).toHaveBeenCalledWith("animelib_webview_login", {});
    expect(mockInvoke).toHaveBeenCalledWith("animelib_finish_webview_login", {});
  });

  it("stores and clears the AnimeLib proxy", async () => {
    mockInvoke.mockImplementation((command: string) => {
      if (command === "animelib_account") {
        return Promise.resolve({ tokenSaved: false, login: null });
      }
      return Promise.resolve(null);
    });

    render(<AnimelibSettings />);

    const input = screen.getByRole("textbox", { name: "Proxy" });
    fireEvent.change(input, { target: { value: "socks5://127.0.0.1:10808" } });
    expect(settingsAtoms.animelibProxyUrl.get()).toBe("socks5://127.0.0.1:10808");

    fireEvent.change(input, { target: { value: "" } });
    expect(settingsAtoms.animelibProxyUrl.get()).toBeNull();
  });

  it("shows the backend refusal and keeps the account signed out", async () => {
    mockInvoke.mockImplementation((command: string) => {
      if (command === "animelib_account") {
        return Promise.resolve({ tokenSaved: false, login: null });
      }
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
    expect(screen.getByText("Not signed in")).toBeDefined();
  });
});
