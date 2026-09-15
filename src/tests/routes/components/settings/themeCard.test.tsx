import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { THEMES } from "@/config/settings/themes.config";
import { ThemeCard } from "@/routes/components/settings/theme/card.theme";
import type { ThemeDefinition } from "@/types/theme";

const WIN95 = THEMES[0];

function card(title: string): HTMLElement {
  return screen.getByTitle(title);
}

/** The preview strip that shows the theme label over the accent colour. */
function accentStrip(element: HTMLElement): HTMLElement {
  const strip = element.querySelector<HTMLElement>('[aria-hidden="true"] > div');
  if (!strip) throw new Error("accent strip not found");
  return strip;
}

function swatches(element: HTMLElement): HTMLElement[] {
  return [...element.querySelectorAll<HTMLElement>('[aria-hidden="true"] span')];
}

afterEach(() => cleanup());

describe("ThemeCard preview", () => {
  it("paints the preview from the theme tokens", () => {
    render(<ThemeCard theme={WIN95} isActive onSelect={() => {}} />);

    const strip = accentStrip(card("Windows 95"));
    expect(strip.style.background).toBe("rgb(0, 0, 128)");
    expect(strip.style.color).toBe("rgb(255, 255, 255)");

    const colors = swatches(card("Windows 95")).map((el) => el.style.background);
    expect(colors.slice(0, 4)).toEqual([
      "rgb(208, 208, 208)",
      "rgb(0, 0, 255)",
      "rgb(0, 128, 0)",
      "rgb(128, 0, 0)",
    ]);
  });

  it("flips the label colour when the accent is light", () => {
    const light: ThemeDefinition = {
      ...WIN95,
      colors: { ...WIN95.colors, secondary: "#f0f0f0" },
      label: "Light accent",
      name: "light-accent",
    };
    render(<ThemeCard theme={light} isActive onSelect={() => {}} />);

    expect(accentStrip(card("Light accent")).style.color).toBe("rgb(0, 0, 0)");
  });

  it("previews the content background token", () => {
    render(<ThemeCard theme={WIN95} isActive onSelect={() => {}} />);
    const preview = card("Windows 95").querySelector<HTMLElement>('[aria-hidden="true"]');
    expect(preview?.style.background).toBe("rgb(192, 192, 192)");
  });

  it("marks the active card and reports the selection", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<ThemeCard theme={WIN95} isActive={false} onSelect={onSelect} />);

    const button = screen.getByRole("button", { pressed: false });
    await user.click(button);
    expect(onSelect).toHaveBeenCalledTimes(1);

    cleanup();
    render(<ThemeCard theme={WIN95} isActive onSelect={onSelect} />);
    expect(screen.getByRole("button", { pressed: true })).toBeTruthy();
  });
});

describe("ThemeCard custom theme actions", () => {
  it("offers edit and delete for custom themes", async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    render(
      <ThemeCard
        theme={{ ...WIN95, label: "My theme", name: "custom" }}
        isActive={false}
        isCustom
        onSelect={() => {}}
        onEdit={onEdit}
        onDelete={onDelete}
      />
    );

    expect(screen.getByText("My theme (custom)")).toBeTruthy();
    await user.click(screen.getByText("edit"));
    await user.click(screen.getByText("delete"));
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it("shows no actions for built-in themes", () => {
    render(<ThemeCard theme={WIN95} isActive onSelect={() => {}} />);
    expect(screen.queryByText("edit")).toBeNull();
    expect(screen.queryByText("delete")).toBeNull();
  });
});
