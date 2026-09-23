import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";

import { ColorPickerTrigger } from "@/components/ui/color/trigger.color";
import { useSettingsStore } from "@/store/settings.store";

beforeEach(() => {
  useSettingsStore.setState({ language: "en" });
});

afterEach(cleanup);

function mockRect(element: Element, width: number, height: number) {
  element.getBoundingClientRect = () =>
    ({
      bottom: height,
      height,
      left: 0,
      right: width,
      toJSON: () => {},
      top: 0,
      width,
      x: 0,
      y: 0,
    }) as DOMRect;
}

async function open(value = "#000000", onChange = vi.fn()) {
  const user = userEvent.setup();
  const view = render(<ColorPickerTrigger value={value} onChange={onChange} />);
  await user.click(screen.getByRole("button"));
  return { onChange, user, view };
}

const plane = () => screen.getByRole("slider", { name: "Saturation and brightness" });
const hueTrack = () => screen.getByRole("slider", { name: "Hue" });

describe("ColorPickerTrigger", () => {
  it("opens the picker on click", async () => {
    const user = userEvent.setup();
    render(<ColorPickerTrigger value="#000000" onChange={vi.fn()} />);
    expect(screen.queryByTitle("#ff0000")).toBeNull();
    await user.click(screen.getByRole("button"));
    expect(screen.getByTitle("#ff0000")).toBeTruthy();
  });

  it("confirms a palette color selection", async () => {
    const { onChange, user } = await open();
    await user.click(screen.getByTitle("#ff0000"));
    await user.click(screen.getByRole("button", { name: "OK" }));
    expect(onChange).toHaveBeenCalledWith("#ff0000");
  });

  it("confirms a color typed as hex", async () => {
    const { onChange, user } = await open();
    const hexInput = screen.getByPlaceholderText("000000");
    await user.clear(hexInput);
    await user.type(hexInput, "ff8800");
    await user.click(screen.getByRole("button", { name: "OK" }));
    expect(onChange).toHaveBeenCalledWith("#ff8800");
  });

  it("closes without confirming on Cancel", async () => {
    const { onChange, user } = await open();
    await user.click(screen.getByTitle("#0000ff"));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByTitle("#ff0000")).toBeNull();
  });

  it("closes on Escape", async () => {
    const { user } = await open();
    expect(screen.getByTitle("#ff0000")).toBeTruthy();
    await user.keyboard("{Escape}");
    expect(screen.queryByTitle("#ff0000")).toBeNull();
  });
});

describe("ColorPicker fields", () => {
  it("hands back the value it was opened with, untouched", async () => {
    const { onChange, user } = await open("#ff8800");
    await user.click(screen.getByRole("button", { name: "OK" }));
    expect(onChange).toHaveBeenCalledWith("#ff8800");
  });

  it("steps brightness and saturation with the arrow keys, ten at a time with shift", async () => {
    const { onChange, user } = await open("#ff0000");

    expect(plane().getAttribute("aria-valuetext")).toBe("Saturation 100%, brightness 100%");
    fireEvent.keyDown(plane(), { key: "ArrowDown", shiftKey: true });
    expect(plane().getAttribute("aria-valuetext")).toBe("Saturation 100%, brightness 90%");
    fireEvent.keyDown(plane(), { key: "ArrowLeft" });
    expect(plane().getAttribute("aria-valuetext")).toBe("Saturation 99%, brightness 90%");

    await user.click(screen.getByRole("button", { name: "OK" }));
    expect(onChange).toHaveBeenCalledWith("#e60202");
  });

  it("takes the colour from where the plane is clicked and follows the drag", async () => {
    const { onChange, user } = await open("#ff0000");
    mockRect(plane(), 200, 100);

    fireEvent.mouseDown(plane(), { clientX: 100, clientY: 0 });
    expect(plane().getAttribute("aria-valuetext")).toBe("Saturation 50%, brightness 100%");

    fireEvent.mouseMove(window, { clientX: 100, clientY: 50 });
    expect(plane().getAttribute("aria-valuetext")).toBe("Saturation 50%, brightness 50%");

    fireEvent.mouseUp(window);
    fireEvent.mouseMove(window, { clientX: 0, clientY: 0 });
    expect(plane().getAttribute("aria-valuetext")).toBe("Saturation 50%, brightness 50%");

    await user.click(screen.getByRole("button", { name: "OK" }));
    expect(onChange).toHaveBeenCalledWith("#804040");
  });

  it("ignores a click on a plane with no box to map into", async () => {
    const { onChange, user } = await open("#ff0000");

    fireEvent.mouseDown(plane(), { clientX: 100, clientY: 0 });
    await user.click(screen.getByRole("button", { name: "OK" }));

    expect(onChange).toHaveBeenCalledWith("#ff0000");
  });

  it("moves the hue with the track, the keyboard and Home/End", async () => {
    const { onChange, user } = await open("#ff0000");
    mockRect(hueTrack(), 360, 16);

    fireEvent.mouseDown(hueTrack(), { clientX: 180 });
    fireEvent.mouseUp(window);
    expect(hueTrack().getAttribute("aria-valuenow")).toBe("180");

    fireEvent.keyDown(hueTrack(), { key: "ArrowRight" });
    expect(hueTrack().getAttribute("aria-valuenow")).toBe("181");
    fireEvent.keyDown(hueTrack(), { key: "Home" });
    expect(hueTrack().getAttribute("aria-valuenow")).toBe("0");

    fireEvent.keyDown(hueTrack(), { key: "ArrowLeft" });
    expect(hueTrack().getAttribute("aria-valuenow")).toBe("0");
    fireEvent.keyDown(hueTrack(), { key: "End" });
    expect(hueTrack().getAttribute("aria-valuenow")).toBe("360");

    await user.click(screen.getByRole("button", { name: "OK" }));
    expect(onChange).toHaveBeenCalledWith("#ff0000");
  });

  it("edits the colour through the RGB channels", async () => {
    const { onChange, user } = await open("#000000");
    await user.click(screen.getByRole("button", { name: "RGB" }));

    const red = screen.getByLabelText("r channel (RGB)");
    expect(screen.getByLabelText("g channel (RGB)")).toBeDefined();
    expect(screen.getByLabelText("b channel (RGB)")).toBeDefined();
    await user.clear(red);
    await user.type(red, "255");

    await user.click(screen.getByRole("button", { name: "OK" }));
    expect(onChange).toHaveBeenCalledWith("#ff0000");
  });

  it("shows and edits the HSL channels", async () => {
    const { onChange, user } = await open("#ff0000");
    await user.click(screen.getByRole("button", { name: "HSL" }));

    expect(screen.getByLabelText("h channel (HSL)")).toHaveProperty("value", "0");
    expect(screen.getByLabelText("s channel (HSL)")).toHaveProperty("value", "100");
    expect(screen.getByLabelText("l channel (HSL)")).toHaveProperty("value", "50");

    const lightness = screen.getByLabelText("l channel (HSL)");
    await user.clear(lightness);
    await user.type(lightness, "25");

    await user.click(screen.getByRole("button", { name: "OK" }));
    expect(onChange).toHaveBeenCalledWith("#800000");
  });

  it("does not carry a half-typed draft into the other channel format", async () => {
    const { user } = await open("#ff0000");
    await user.click(screen.getByRole("button", { name: "RGB" }));
    const red = screen.getByLabelText("r channel (RGB)");
    await user.clear(red);
    await user.type(red, "12");

    await user.click(screen.getByRole("button", { name: "HSL" }));

    expect(screen.getByLabelText("h channel (HSL)")).toHaveProperty("value", "0");
    expect(screen.getByLabelText("s channel (HSL)")).toHaveProperty("value", "100");
    expect(screen.getByLabelText("l channel (HSL)")).toHaveProperty("value", "2");
  });

  it("marks unreadable text and keeps the last good colour", async () => {
    const { onChange, user } = await open("#ff0000");
    const hexInput = screen.getByPlaceholderText("000000");
    await user.clear(hexInput);
    await user.type(hexInput, "zzz");

    expect(hexInput.getAttribute("aria-invalid")).toBe("true");
    await user.click(screen.getByRole("button", { name: "OK" }));
    expect(onChange).toHaveBeenCalledWith("#ff0000");
  });

  it("follows a value that changes while it is open", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(<ColorPickerTrigger value="#000000" onChange={onChange} />);
    await user.click(screen.getByRole("button"));

    rerender(<ColorPickerTrigger value="#00ff00" onChange={onChange} />);

    expect(plane().getAttribute("aria-valuetext")).toBe("Saturation 100%, brightness 100%");
    await user.click(screen.getByRole("button", { name: "OK" }));
    expect(onChange).toHaveBeenCalledWith("#00ff00");
  });
});
