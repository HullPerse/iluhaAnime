import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import Select from "@/components/ui/select.component";
import { patchSettings } from "@/store/settings.store";

const OPTIONS = [
  { value: "a", label: "Alpha" },
  { value: "b", label: "Beta" },
  { value: "c", label: "Gamma" },
];

const openSearchable = (onChange: (value: string) => void = () => undefined) => {
  patchSettings({ language: "en" });
  render(<Select value="a" onChange={onChange} options={OPTIONS} searchable />);
  fireEvent.mouseDown(screen.getByRole("combobox"));
  return onChange;
};

const searchInput = (): HTMLInputElement => {
  return screen.getByPlaceholderText("Search...") as HTMLInputElement;
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("searchable Select Escape ladder", () => {
  it("keeps the popup open on the first Escape and moves focus from search to the list", async () => {
    openSearchable();
    const listbox = await screen.findByRole("listbox");
    const input = searchInput();
    input.focus();
    expect(document.activeElement).toBe(input);

    fireEvent.keyDown(input, { key: "Escape", code: "Escape" });

    expect(screen.queryByRole("listbox")).not.toBeNull();
    expect(document.activeElement).toBe(listbox);
    expect(document.activeElement).not.toBe(input);
  });

  it("closes the popup on the second Escape from the list", async () => {
    openSearchable();
    await screen.findByRole("listbox");
    const input = searchInput();
    input.focus();

    fireEvent.keyDown(input, { key: "Escape", code: "Escape" });
    const listbox = screen.getByRole("listbox");
    fireEvent.keyDown(listbox, { key: "Escape", code: "Escape" });

    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("navigates with arrows and selects with Enter after leaving search", async () => {
    const onChange = vi.fn<(value: string) => void>();
    openSearchable(onChange);
    await screen.findByRole("listbox");
    const input = searchInput();
    input.focus();

    fireEvent.keyDown(input, { key: "Escape", code: "Escape" });
    const listbox = screen.getByRole("listbox");
    fireEvent.keyDown(listbox, { key: "ArrowDown", code: "ArrowDown" });
    fireEvent.keyDown(listbox, { key: "ArrowDown", code: "ArrowDown" });
    const focused = document.activeElement;
    expect(focused?.getAttribute("role")).toBe("option");
    fireEvent.keyDown(focused as HTMLElement, { key: "Enter", code: "Enter" });
    fireEvent.keyUp(focused as HTMLElement, { key: "Enter", code: "Enter" });

    expect(onChange).toHaveBeenCalledWith("b");
  });

  it("still filters options while typing in search", async () => {
    openSearchable();
    await screen.findByRole("listbox");
    const input = searchInput();

    fireEvent.change(input, { target: { value: "bet" } });

    expect(screen.queryByRole("option", { name: "Alpha" })).toBeNull();
    expect(screen.getByRole("option", { name: "Beta" })).not.toBeNull();
  });
});
