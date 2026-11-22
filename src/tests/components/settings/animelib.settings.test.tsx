import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import AnimelibSettings from "@/routes/components/settings/animelib.settings";
import { patchSettings, settingsAtoms } from "@/store/settings.store";

import { mockInvoke } from "@/tests/mocks";

beforeEach(() => {
  patchSettings({ language: "ru", animelibProxyUrl: null });
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
          stored
            ? { tokenSaved: true, authorized: true, login: "milky" }
            : { tokenSaved: false, authorized: false, login: null }
        );
      }

      if (command === "animelib_token_clear") {
        stored = false;

        return Promise.resolve(null);
      }

      return Promise.resolve(null);
    });

    render(<AnimelibSettings />);

    await screen.findByText("Вы вошли как milky");
    fireEvent.click(screen.getByRole("button", { name: "Удалить токен" }));

    await screen.findByText("Вход не выполнен");
    expect(mockInvoke).toHaveBeenCalledWith("animelib_token_clear", undefined);
  });

  it("saves a trimmed token and shows the account behind it", async () => {
    let saved = false;
    mockInvoke.mockImplementation((command: string) => {
      if (command === "animelib_account") {
        return Promise.resolve(
          saved
            ? { tokenSaved: true, authorized: true, login: "milky" }
            : { tokenSaved: false, authorized: false, login: null }
        );
      }

      if (command === "animelib_token_save") {
        saved = true;

        return Promise.resolve(null);
      }

      return Promise.resolve(null);
    });

    render(<AnimelibSettings />);

    const input = await screen.findByLabelText("Токен сессии");
    fireEvent.change(input, { target: { value: "  token.value  " } });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить токен" }));

    await screen.findByText("Токен проверен и сохранён");
    expect(mockInvoke).toHaveBeenCalledWith("animelib_token_save", {
      token: "token.value",
    });
    expect(await screen.findByText("Вы вошли как milky")).toBeDefined();
  });

  it("shows a valid session that has no display name", async () => {
    mockInvoke.mockImplementation((command: string) => {
      if (command === "animelib_account") {
        return Promise.resolve({ tokenSaved: true, authorized: true, login: null });
      }

      return Promise.resolve(null);
    });

    render(<AnimelibSettings />);

    await screen.findByText("Вы вошли в аккаунт AnimeLib");
    expect(screen.queryByText("Токен сохранён, но сессия отклонена")).toBeNull();
  });

  it("marks a saved token that the session check rejects", async () => {
    mockInvoke.mockImplementation((command: string) => {
      if (command === "animelib_account") {
        return Promise.resolve({ tokenSaved: true, authorized: false, login: null });
      }

      return Promise.resolve(null);
    });

    render(<AnimelibSettings />);

    await screen.findByText("Токен сохранён, но сессия отклонена");
  });

  it("logs in through the site window and refreshes the account", async () => {
    let done = false;
    mockInvoke.mockImplementation((command: string) => {
      if (command === "animelib_account") {
        return Promise.resolve(
          done
            ? { tokenSaved: true, authorized: true, login: "milky" }
            : { tokenSaved: false, authorized: false, login: null }
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

    await screen.findByText("Вход не выполнен");
    fireEvent.click(screen.getByRole("button", { name: "Войти через AnimeLib" }));

    await screen.findByText("Вы вошли как milky");
    expect(mockInvoke).toHaveBeenCalledWith("animelib_webview_login", {});
    expect(mockInvoke).toHaveBeenCalledWith("animelib_finish_webview_login", {});
  });

  it("stores and clears the AnimeLib proxy", async () => {
    mockInvoke.mockImplementation((command: string) => {
      if (command === "animelib_account") {
        return Promise.resolve({ tokenSaved: false, authorized: false, login: null });
      }

      return Promise.resolve(null);
    });

    render(<AnimelibSettings />);

    const input = screen.getByRole("textbox", { name: "Прокси" });
    fireEvent.change(input, { target: { value: "socks5://127.0.0.1:10808" } });
    expect(settingsAtoms.animelibProxyUrl.get()).toBe("socks5://127.0.0.1:10808");

    fireEvent.change(input, { target: { value: "" } });
    expect(settingsAtoms.animelibProxyUrl.get()).toBeNull();
  });

  it("shows the backend refusal and keeps the account signed out", async () => {
    mockInvoke.mockImplementation((command: string) => {
      if (command === "animelib_account") {
        return Promise.resolve({ tokenSaved: false, authorized: false, login: null });
      }

      if (command === "animelib_token_save") {
        return Promise.reject(new Error("AnimeLib rejected the token"));
      }

      return Promise.resolve(null);
    });

    render(<AnimelibSettings />);

    fireEvent.change(await screen.findByLabelText("Токен сессии"), {
      target: { value: "expired" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить токен" }));

    await screen.findByText("AnimeLib rejected the token");
    expect(screen.getByText("Вход не выполнен")).toBeDefined();
  });
});
