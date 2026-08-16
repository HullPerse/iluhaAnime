import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";

import { ColorPickerTrigger } from "@/components/ui/color.component";
import { useSettingsStore } from "@/store/settings.store";

beforeEach(() => {
  useSettingsStore.setState({ language: "ru" });
});

afterEach(cleanup);

describe("ColorPickerTrigger", () => {
  it("opens the picker on click", async () => {
    const user = userEvent.setup();
    render(<ColorPickerTrigger value="#000000" onChange={vi.fn()} />);
    expect(screen.queryByTitle("#ff0000")).toBeNull();
    await user.click(screen.getByRole("button"));
    expect(screen.getByTitle("#ff0000")).toBeTruthy();
  });

  it("confirms a palette color selection", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ColorPickerTrigger value="#000000" onChange={onChange} />);
    await user.click(screen.getByRole("button"));
    await user.click(screen.getByTitle("#ff0000"));
    await user.click(screen.getByRole("button", { name: "OK" }));
    expect(onChange).toHaveBeenCalledWith("#ff0000");
  });

  it("confirms a color typed as hex", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ColorPickerTrigger value="#000000" onChange={onChange} />);
    await user.click(screen.getByRole("button"));
    const hexInput = screen.getByPlaceholderText("000000");
    await user.clear(hexInput);
    await user.type(hexInput, "ff8800");
    await user.click(screen.getByRole("button", { name: "OK" }));
    expect(onChange).toHaveBeenCalledWith("#ff8800");
  });

  it("closes without confirming on Cancel", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ColorPickerTrigger value="#000000" onChange={onChange} />);
    await user.click(screen.getByRole("button"));
    await user.click(screen.getByTitle("#0000ff"));
    await user.click(screen.getByRole("button", { name: "Отмена" }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByTitle("#ff0000")).toBeNull();
  });

  it("closes on Escape", async () => {
    const user = userEvent.setup();
    render(<ColorPickerTrigger value="#000000" onChange={vi.fn()} />);
    await user.click(screen.getByRole("button"));
    expect(screen.getByTitle("#ff0000")).toBeTruthy();
    await user.keyboard("{Escape}");
    expect(screen.queryByTitle("#ff0000")).toBeNull();
  });
});
