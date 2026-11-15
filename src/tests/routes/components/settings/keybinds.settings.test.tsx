import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { KEYBIND_MANIFEST } from "@/config/system/manifest.config";
import { SettingsKeybinds } from "@/routes/components/settings/keybinds.settings";
import { patchSettings, settingsAtoms } from "@/store/settings.store";

const rows = (): HTMLElement[] => {
  return screen.queryAllByRole("row").filter((row) => row.querySelector('[role="cell"]') !== null);
};

const rowWith = (text: string): HTMLElement => {
  const found = rows().find((row) => row.textContent?.includes(text));
  if (!found) throw new Error(`row missing: ${text}`);
  return found;
};

beforeEach(() => {
  patchSettings({ language: "ru" });
});

afterEach(() => {
  cleanup();
  patchSettings({ keybindOverrides: {} });
});

describe("SettingsKeybinds", () => {
  it("renders one row per manifest entry", () => {
    render(<SettingsKeybinds />);

    expect(rows()).toHaveLength(KEYBIND_MANIFEST.length);
    expect(rowWith("Воспроизвести файл во встроенном плеере")).not.toBeNull();
  });

  it("shows scope-prefixed chords in the first column", () => {
    render(<SettingsKeybinds />);

    const row = rowWith("Открыть файл во внешнем плеере");
    expect(row.textContent).toMatch(/Деревья:\s*O/);
  });

  it("filters by text query", () => {
    render(<SettingsKeybinds />);
    const search = screen.getByRole("textbox", { name: "Поиск сочетаний..." });

    fireEvent.change(search, { target: { value: "player.toggle.queue" } });

    expect(rows()).toHaveLength(1);
    expect(rowWith("панель очереди")).not.toBeNull();
  });

  it("shows the empty state without matches", () => {
    render(<SettingsKeybinds />);
    const search = screen.getByRole("textbox", { name: "Поиск сочетаний..." });

    fireEvent.change(search, { target: { value: "zzz-no-such-chord" } });

    expect(rows()).toHaveLength(0);
    expect(screen.getByText("Нет подходящих сочетаний")).not.toBeNull();
  });

  it("filters by scope", async () => {
    render(<SettingsKeybinds />);
    const expected = KEYBIND_MANIFEST.filter((entry) => entry.scope === "vim").length;
    expect(expected).toBeGreaterThan(0);

    await userEvent.click(screen.getByRole("combobox"));
    await waitFor(() => screen.getByRole("option", { name: "Vim" }));
    await userEvent.click(screen.getByRole("option", { name: "Vim" }));

    await waitFor(() => expect(rows()).toHaveLength(expected));
  });
});

describe("SettingsKeybinds editor", () => {
  const recordBox = (): HTMLElement => {
    return screen.getByRole("textbox", { name: "Нажмите сочетание..." });
  };

  it("shows the rebound chord with a reset button", () => {
    patchSettings({ keybindOverrides: { "tree.move.down": "KeyX" } });
    render(<SettingsKeybinds />);

    const row = rowWith("На следующую строку");
    expect(row.textContent).toMatch(/Деревья:\s*X/);
    expect(screen.getByRole("button", { name: "reset tree.move.down" })).not.toBeNull();
  });

  it("marks the shadowed loser muted with its fallback", () => {
    patchSettings({ keybindOverrides: { "tree.move.up": "KeyJ" } });
    render(<SettingsKeybinds />);

    const row = rowWith("На следующую строку");
    expect(row.textContent).toMatch(/Не назначено/);
    expect(screen.getByLabelText(/Занято:/)).not.toBeNull();
  });

  it("opens the recorder on pencil and closes on Escape", async () => {
    render(<SettingsKeybinds />);
    await userEvent.click(screen.getByRole("button", { name: "edit tree.move.down" }));

    expect(recordBox()).not.toBeNull();
    fireEvent.keyDown(recordBox(), { code: "Escape", key: "Escape" });

    expect(screen.queryByRole("textbox", { name: "Нажмите сочетание..." })).toBeNull();
  });

  it("records a chord and saves it into the store", async () => {
    render(<SettingsKeybinds />);
    await userEvent.click(screen.getByRole("button", { name: "edit tree.move.down" }));

    fireEvent.keyDown(recordBox(), { code: "KeyX", key: "x" });
    await userEvent.click(screen.getByRole("button", { name: "OK" }));

    expect(settingsAtoms.keybindOverrides.get()).toEqual({ "tree.move.down": "KeyX" });
    await waitFor(() => expect(rowWith("На следующую строку").textContent).toMatch(/Деревья:\s*X/));
  });

  it("unbinds through clear plus OK", async () => {
    patchSettings({ keybindOverrides: { "tree.move.down": "KeyX" } });
    render(<SettingsKeybinds />);
    await userEvent.click(screen.getByRole("button", { name: "edit tree.move.down" }));

    const clears = screen.getAllByRole("button", { name: "Очистить" });
    await userEvent.click(clears[0]);
    await userEvent.click(screen.getByRole("button", { name: "OK" }));

    expect(settingsAtoms.keybindOverrides.get()).toEqual({ "tree.move.down": null });
  });

  it("resets one row and then everything", async () => {
    patchSettings({ keybindOverrides: { "tree.move.down": "KeyX", "tree.move.up": "KeyY" } });
    render(<SettingsKeybinds />);

    await userEvent.click(screen.getByRole("button", { name: "reset tree.move.down" }));
    expect(settingsAtoms.keybindOverrides.get()).toEqual({ "tree.move.up": "KeyY" });

    await userEvent.click(screen.getByRole("button", { name: "Сбросить всё" }));
    expect(settingsAtoms.keybindOverrides.get()).toEqual({});
  });

  it("finds entries by captured keys", async () => {
    render(<SettingsKeybinds />);
    await userEvent.click(screen.getByRole("button", { name: "Найти по клавишам" }));
    fireEvent.keyDown(recordBox(), { code: "KeyJ", key: "j" });
    fireEvent.keyDown(recordBox(), { code: "Enter", key: "Enter" });

    const expected = KEYBIND_MANIFEST.filter((entry) => entry.chord === "KeyJ").length;
    await waitFor(() => expect(rows()).toHaveLength(expected));
  });

  it("shows the action, current and new chord groups in the editor", async () => {
    patchSettings({ keybindOverrides: { "tree.move.down": "KeyX" } });
    render(<SettingsKeybinds />);
    await userEvent.click(screen.getByRole("button", { name: "edit tree.move.down" }));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Действие")).not.toBeNull();
    expect(within(dialog).getByText("На следующую строку")).not.toBeNull();
    expect(within(dialog).getByText("tree.move.down")).not.toBeNull();
    expect(within(dialog).getByText("Текущее сочетание")).not.toBeNull();
    expect(within(dialog).getByText("Новое сочетание")).not.toBeNull();
    expect(dialog.querySelector('[data-scope-icon="tree"]')).not.toBeNull();
  });

  it("previews the conflict while recording", async () => {
    render(<SettingsKeybinds />);
    await userEvent.click(screen.getByRole("button", { name: "edit tree.move.down" }));

    fireEvent.keyDown(recordBox(), { code: "KeyK", key: "k" });

    await waitFor(() => expect(screen.getByText(/уже используется/iu)).not.toBeNull());
    expect(screen.getAllByText(/На предыдущую строку/).length).toBeGreaterThan(0);
  });

  it("blocks reserved sequence prefixes with a note", async () => {
    render(<SettingsKeybinds />);
    await userEvent.click(screen.getByRole("button", { name: "edit tree.move.down" }));

    fireEvent.keyDown(recordBox(), { code: "KeyG", key: "g" });

    await waitFor(() => expect(screen.getByText("Занято под сиквенсы")).not.toBeNull());
    expect(screen.getByRole("button", { name: "OK" }).getAttribute("disabled")).not.toBeNull();
  });

  it("returns focus to the pencil button after save", async () => {
    render(<SettingsKeybinds />);
    await userEvent.click(screen.getByRole("button", { name: "edit tree.move.down" }));

    fireEvent.keyDown(recordBox(), { code: "KeyX", key: "x" });
    await userEvent.click(screen.getByRole("button", { name: "OK" }));

    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("button", { name: "edit tree.move.down" })
      )
    );
  });

  it("opens the editor in a modal on double click", async () => {
    render(<SettingsKeybinds />);
    const row = rowWith("На следующую строку").closest('[role="row"]');
    if (!row) throw new Error("row missing");

    fireEvent.doubleClick(row);

    expect(screen.getByRole("dialog")).not.toBeNull();
    expect(recordBox()).not.toBeNull();
  });

  it("filters to conflicted rows on toggle", async () => {
    patchSettings({ keybindOverrides: { "tree.move.up": "KeyJ" } });
    render(<SettingsKeybinds />);
    expect(rows().length).toBeGreaterThan(1);

    await userEvent.click(screen.getByRole("button", { name: "Только конфликты" }));

    expect(rows()).toHaveLength(1);
    expect(rowWith("На следующую строку")).not.toBeNull();
  });

  it("resets the row from the modal footer", async () => {
    patchSettings({ keybindOverrides: { "tree.move.down": "KeyX" } });
    render(<SettingsKeybinds />);
    await userEvent.click(screen.getByRole("button", { name: "edit tree.move.down" }));

    await userEvent.click(screen.getByRole("button", { name: "Сбросить" }));

    expect(settingsAtoms.keybindOverrides.get()).toEqual({});
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("captures chords with physically held modifiers", async () => {
    render(<SettingsKeybinds />);
    await userEvent.click(screen.getByRole("button", { name: "edit tree.move.down" }));

    fireEvent.keyDown(recordBox(), { code: "ControlLeft", key: "Control", ctrlKey: true });
    fireEvent.keyDown(recordBox(), { code: "KeyX", key: "x", ctrlKey: true });

    await userEvent.click(screen.getByRole("button", { name: "OK" }));
    expect(settingsAtoms.keybindOverrides.get()).toEqual({ "tree.move.down": "ctrl+KeyX" });
  });

  it("highlights held modifiers in the display-only indicator row", async () => {
    render(<SettingsKeybinds />);
    await userEvent.click(screen.getByRole("button", { name: "edit tree.move.down" }));

    const dialog = screen.getByRole("dialog");
    fireEvent.keyDown(recordBox(), { code: "ControlLeft", key: "Control", ctrlKey: true });

    const indicator = within(dialog).getByText("Ctrl");
    expect(indicator.className).toContain("bg-primary");
    fireEvent.keyUp(recordBox(), { code: "ControlLeft", key: "Control", ctrlKey: false });
    await waitFor(() => expect(indicator.className).toContain("bg-field"));
  });

  it("collapses and expands scope groups", async () => {
    render(<SettingsKeybinds />);
    const before = rows().length;
    expect(before).toBeGreaterThan(0);

    await userEvent.click(screen.getByRole("button", { name: /Деревья/ }));

    expect(rows().length).toBeLessThan(before);
  });

  it("highlights the selected row on click", async () => {
    render(<SettingsKeybinds />);
    const row = rowWith("На следующую строку").closest('[role="row"]');
    if (!row) throw new Error("row missing");

    await userEvent.click(row);

    expect(row.className).toMatch(/bg-highlight/);
  });
});
