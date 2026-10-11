import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import type { RefObject } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { searchSettingsFind } from "@/lib/settings/find.utils";
import type { SettingsFindHit } from "@/lib/settings/find.utils";
import { FindBox } from "@/routes/components/settings/findBox.settings";
import { FindResults } from "@/routes/components/settings/findResults.settings";
import { patchSettings } from "@/store/settings.store";

beforeEach(() => {
  patchSettings({ language: "ru" });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function boxProps(overrides?: {
  value?: string;
  onChange?: (value: string) => void;
  onJumpSelected?: () => void;
  optionCount?: number;
  activeIndex?: number;
  onActiveChange?: (index: number) => void;
  inputRef?: RefObject<HTMLInputElement | null>;
}) {
  return {
    value: overrides?.value ?? "прок",
    onChange: overrides?.onChange ?? (() => {}),
    onJumpSelected: overrides?.onJumpSelected ?? (() => {}),
    optionCount: overrides?.optionCount ?? 0,
    activeIndex: overrides?.activeIndex ?? 0,
    onActiveChange: overrides?.onActiveChange ?? (() => {}),
    listId: "settings-find-test",
    inputRef: overrides?.inputRef ?? createRef<HTMLInputElement>(),
  };
}

function resultsProps(
  hits: readonly SettingsFindHit[],
  overrides?: {
    activeIndex?: number;
    onActiveChange?: (index: number) => void;
    onJump?: (hit: SettingsFindHit) => void;
  }
) {
  return {
    hits,
    activeIndex: overrides?.activeIndex ?? 0,
    onActiveChange: overrides?.onActiveChange ?? (() => {}),
    onJump: overrides?.onJump ?? (() => {}),
    listId: "settings-find-test",
  };
}

describe("settings find box", () => {
  it("clears the query on Escape", async () => {
    const onChange = vi.fn();
    render(<FindBox {...boxProps({ value: "прокси", onChange })} />);
    const box = screen.getByRole("combobox", { name: "Найти параметр..." });
    box.focus();
    fireEvent.keyDown(box, { key: "Escape" });
    expect(onChange).toHaveBeenCalledWith("");
  });

  it("renders no clear button", () => {
    const view = render(<FindBox {...boxProps()} />);
    expect(view.container.querySelector("button")).toBeNull();
  });

  it("forwards the input ref", () => {
    const inputRef = createRef<HTMLInputElement>();
    render(<FindBox {...boxProps({ inputRef })} />);
    expect(inputRef.current).toBe(screen.getByRole("combobox", { name: "Найти параметр..." }));
  });

  it("jumps to the selected hit on Enter", async () => {
    const onJumpSelected = vi.fn();
    render(<FindBox {...boxProps({ onJumpSelected })} />);
    const box = screen.getByRole("combobox", { name: "Найти параметр..." });
    box.focus();
    fireEvent.keyDown(box, { key: "Enter" });
    expect(onJumpSelected).toHaveBeenCalledTimes(1);
  });

  it("moves the active option with arrows without leaving the field", async () => {
    const onActiveChange = vi.fn();
    render(<FindBox {...boxProps({ optionCount: 8, activeIndex: 2, onActiveChange })} />);
    const box = screen.getByRole("combobox", { name: "Найти параметр..." });
    box.focus();
    expect(box.getAttribute("aria-activedescendant")).toBe("settings-find-test-2");
    fireEvent.keyDown(box, { key: "ArrowDown" });
    expect(onActiveChange).toHaveBeenCalledWith(3);
    fireEvent.keyDown(box, { key: "ArrowUp" });
    expect(onActiveChange).toHaveBeenCalledWith(1);
    expect(document.activeElement).toBe(box);
  });
});

describe("settings find results", () => {
  it("groups russian matches by tab with highlighted text", () => {
    const hits = searchSettingsFind("прокси");
    const onJump = vi.fn();
    const view = render(<FindResults {...resultsProps(hits, { onJump })} />);
    expect(screen.getByRole("listbox")).toBeDefined();
    expect(view.container.querySelectorAll('[role="option"] .bg-highlight').length).toBeGreaterThan(
      0
    );
    expect(view.container.querySelectorAll(".text-highlight").length).toBe(0);
    expect(view.container.textContent).toContain("Торренты");
  });

  it("shows the english label with a badge when only english matches", () => {
    const hits = searchSettingsFind("timeout");
    const view = render(<FindResults {...resultsProps(hits)} />);
    expect(view.container.textContent).toContain("EN");
    expect(view.container.textContent).toContain("Peer connect timeout");
  });

  it("marks the controlled active option and follows hover", async () => {
    const user = userEvent.setup();
    const hits = searchSettingsFind("прокси");
    const onActiveChange = vi.fn();
    const onJump = vi.fn();
    const view = render(
      <FindResults {...resultsProps(hits, { activeIndex: 1, onActiveChange, onJump })} />
    );
    const options = screen.getAllByRole("option");
    expect(options[1]?.getAttribute("aria-selected")).toBe("true");
    expect(options[1]?.className).toContain("bg-highlight");
    expect(options[0]?.getAttribute("tabindex")).toBe("-1");
    await user.click(options[2] as Element);
    expect(onJump).toHaveBeenCalledTimes(1);
    expect(onJump.mock.calls[0]?.[0]).toBe(hits[2]);
    expect(view.container.querySelector('[data-index="1"]')?.id).toBe("settings-find-test-1");
  });

  it("shows the empty state when nothing matches", () => {
    render(<FindResults {...resultsProps([])} />);
    expect(screen.getByText("Нет результатов")).toBeDefined();
  });
});
