import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import GameKeypad from "@/routes/components/game/keypad.game";
import { patchSettings } from "@/store/settings.store";

beforeEach(() => {
  patchSettings({ language: "en" });
});

afterEach(() => {
  cleanup();
});

describe("GameKeypad", () => {
  it("shows the pressed state of both input paths", () => {
    render(<GameKeypad pressedKeys={new Set([5, 0xc])} enabled onPress={() => undefined} />);

    expect(screen.getByTitle("5").dataset.pressed).toBe("true");
    expect(screen.getByTitle("C").dataset.pressed).toBe("true");
    expect(screen.getByTitle("4").dataset.pressed).toBeUndefined();
  });

  it("routes pointer presses through onPress", () => {
    const onPress = vi.fn();
    render(<GameKeypad pressedKeys={new Set()} enabled onPress={onPress} />);

    const cap = screen.getByTitle("5");
    fireEvent.pointerDown(cap);
    expect(onPress).toHaveBeenLastCalledWith(5, true);
    fireEvent.pointerUp(cap);
    expect(onPress).toHaveBeenLastCalledWith(5, false);
    fireEvent.pointerLeave(cap);
    expect(onPress).toHaveBeenLastCalledWith(5, false);
    fireEvent.pointerCancel(cap);
    expect(onPress).toHaveBeenLastCalledWith(5, false);
    expect(onPress).toHaveBeenCalledTimes(4);
  });

  it("stays inert without a running session", () => {
    const onPress = vi.fn();
    render(<GameKeypad pressedKeys={new Set()} enabled={false} onPress={onPress} />);

    fireEvent.pointerDown(screen.getByTitle("5"));
    fireEvent.pointerUp(screen.getByTitle("5"));
    expect(onPress).not.toHaveBeenCalled();
  });

  it("labels the pad for assistive tech", () => {
    render(<GameKeypad pressedKeys={new Set()} enabled onPress={() => undefined} />);
    expect(screen.getByRole("group", { name: "Keypad" })).toBeTruthy();
  });
});
