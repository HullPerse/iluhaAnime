import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import SearchAuthButtons from "@/routes/components/search/auth.search";
import { useSettingsStore } from "@/store/settings.store";

afterEach(() => cleanup());

beforeEach(() => {
  useSettingsStore.setState({ language: "en" });
});

const HANDLERS = {
  onLoginOpen: vi.fn(),
  onApiModalOpen: vi.fn(),
  onEraiLoginOpen: vi.fn(),
  onLogout: vi.fn(),
  onNekoBtLogout: vi.fn(),
  onEraiLogout: vi.fn(),
};

describe("SearchAuthButtons titlebar layout", () => {
  it("renders compact window-style buttons", () => {
    render(
      <SearchAuthButtons
        source="rutracker"
        rutrackerAuth={false}
        nekobtAuth={false}
        eraiAuth={false}
        {...HANDLERS}
        layout="titlebar"
      />
    );
    const button = screen.getByRole("button");
    expect(button.classList.contains("size-4")).toBe(true);
  });

  it("keeps toolbar sizing by default", () => {
    render(
      <SearchAuthButtons
        source="rutracker"
        rutrackerAuth={false}
        nekobtAuth={false}
        eraiAuth={false}
        {...HANDLERS}
      />
    );
    const button = screen.getByRole("button");
    expect(button.classList.contains("size-4")).toBe(false);
  });
});

describe("SearchAuthButtons nekoBT key", () => {
  it("renders the key icon with a tooltip title", () => {
    render(
      <SearchAuthButtons
        source="nekobt"
        rutrackerAuth={false}
        nekobtAuth={false}
        eraiAuth={false}
        {...HANDLERS}
        layout="titlebar"
      />
    );
    expect(screen.getByTitle("key")).not.toBeNull();
  });
});
