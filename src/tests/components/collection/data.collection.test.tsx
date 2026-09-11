import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import DataCollection from "@/routes/components/collection/data.collection";
import { useSettingsStore } from "@/store/settings.store";

function props(overrides = {}) {
  return {
    onHandleJson: vi.fn(),
    onHandleZip: vi.fn(),
    onHandleImport: vi.fn(),
    onHandleAnilist: vi.fn(),
    onRandom: vi.fn(),
    randomDisabled: false,
    ...overrides,
  };
}

afterEach(() => cleanup());

beforeEach(() => {
  useSettingsStore.setState({ language: "en" });
});

describe("DataCollection random", () => {
  it("calls onRandom from the menu", async () => {
    const user = userEvent.setup();
    const onRandom = vi.fn();
    render(<DataCollection {...props({ onRandom })} />);
    await user.click(screen.getByRole("button", { name: "Data" }));
    await waitFor(() => expect(screen.getByRole("menuitem", { name: "Random" })).toBeTruthy());
    await user.click(screen.getByRole("menuitem", { name: "Random" }));
    expect(onRandom).toHaveBeenCalledOnce();
  });

  it("disables the random item when the list is empty", async () => {
    const user = userEvent.setup();
    render(<DataCollection {...props({ randomDisabled: true })} />);
    await user.click(screen.getByRole("button", { name: "Data" }));
    await waitFor(() => expect(screen.getByRole("menuitem", { name: "Random" })).toBeTruthy());
    expect(
      screen.getByRole("menuitem", { name: "Random" }).getAttribute("aria-disabled")
    ).not.toBeNull();
  });
});
