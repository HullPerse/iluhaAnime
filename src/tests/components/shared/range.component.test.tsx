import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DualSlider } from "@/components/ui/dualSlider.component";
import Slider from "@/components/ui/range.component";
import { useSettingsStore } from "@/store/settings.store";

function mockTrackRect(el: Element, width = 100) {
  el.getBoundingClientRect = () =>
    ({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: width,
      bottom: 16,
      width,
      height: 16,
      toJSON: () => {},
    }) as DOMRect;
}

afterEach(() => cleanup());

beforeEach(() => {
  useSettingsStore.setState({ language: "en" });
});

describe("Slider wheel", () => {
  it("ignores wheel by default", () => {
    const onChange = vi.fn();
    render(<Slider min={0} max={10} step={1} value={5} onChange={onChange} />);
    fireEvent.wheel(screen.getByRole("slider"), { deltaY: 100 });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("steps down on wheel down and up on wheel up, clamped to bounds", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <Slider min={0} max={10} step={1} value={5} onChange={onChange} wheel />
    );
    const track = screen.getByRole("slider");
    fireEvent.wheel(track, { deltaY: 100 });
    expect(onChange).toHaveBeenLastCalledWith(4);
    fireEvent.wheel(track, { deltaY: -100 });
    expect(onChange).toHaveBeenLastCalledWith(6);

    rerender(<Slider min={0} max={10} step={1} value={0} onChange={onChange} wheel />);
    fireEvent.wheel(screen.getByRole("slider"), { deltaY: 100 });
    expect(onChange).toHaveBeenLastCalledWith(0);
  });

  it("multiplies the step with shift", () => {
    const onChange = vi.fn();
    render(<Slider min={0} max={100} step={1} value={50} onChange={onChange} wheel />);
    fireEvent.wheel(screen.getByRole("slider"), { deltaY: -100, shiftKey: true });
    expect(onChange).toHaveBeenLastCalledWith(60);
  });
});
describe("Slider keyboard", () => {
  it("steps with arrows and jumps with Home/End", () => {
    const onChange = vi.fn();
    render(<Slider min={0} max={10} step={1} value={5} onChange={onChange} />);
    const track = screen.getByRole("slider");
    fireEvent.keyDown(track, { key: "ArrowRight" });
    expect(onChange).toHaveBeenLastCalledWith(6);
    fireEvent.keyDown(track, { key: "ArrowLeft" });
    expect(onChange).toHaveBeenLastCalledWith(4);
    fireEvent.keyDown(track, { key: "Home" });
    expect(onChange).toHaveBeenLastCalledWith(0);
    fireEvent.keyDown(track, { key: "End" });
    expect(onChange).toHaveBeenLastCalledWith(10);
  });
});

it("focuses the track on mouse down so arrows work after click", () => {
  const onChange = vi.fn();
  render(<Slider min={0} max={10} step={1} value={5} onChange={onChange} />);
  const track = screen.getByRole("slider");
  fireEvent.mouseDown(track);
  expect(document.activeElement).toBe(track);
});

describe("DualSlider keyboard", () => {
  it("steps the focused thumb and clamps against the other", () => {
    const onChange = vi.fn();
    render(<DualSlider min={0} max={10} step={1} value={[3, 7]} onChange={onChange} />);
    const thumbs = screen.getAllByRole("slider");
    fireEvent.keyDown(thumbs[0]!, { key: "ArrowRight" });
    expect(onChange).toHaveBeenLastCalledWith([4, 7]);
    fireEvent.keyDown(thumbs[1]!, { key: "ArrowLeft" });
    expect(onChange).toHaveBeenLastCalledWith([3, 6]);
  });
});

describe("DualSlider wheel", () => {
  function renderDual(value: [number, number]) {
    const onChange = vi.fn();
    render(<DualSlider min={0} max={10} step={1} value={value} onChange={onChange} wheel />);
    const track = screen.getByRole("group").querySelector(":scope > div");
    if (!track) throw new Error("DualSlider track not found");
    mockTrackRect(track);
    return { onChange, track };
  }

  it("adjusts the half nearest to the cursor, mirrored on the left", () => {
    const { onChange, track } = renderDual([3, 7]);
    fireEvent.wheel(track, { deltaY: 100, clientX: 10 });
    expect(onChange).toHaveBeenLastCalledWith([4, 7]);
    fireEvent.wheel(track, { deltaY: -100, clientX: 90 });
    expect(onChange).toHaveBeenLastCalledWith([3, 8]);
  });

  it("clamps thumbs against each other", () => {
    const { onChange, track } = renderDual([5, 5]);
    fireEvent.wheel(track, { deltaY: 100, clientX: 10 });
    expect(onChange).toHaveBeenLastCalledWith([5, 5]);
    fireEvent.wheel(track, { deltaY: -100, clientX: 10 });
    expect(onChange).toHaveBeenLastCalledWith([4, 5]);
  });

  it("ignores wheel by default", () => {
    const onChange = vi.fn();
    render(<DualSlider min={0} max={10} step={1} value={[3, 7]} onChange={onChange} />);
    const track = screen.getByRole("group").querySelector(":scope > div");
    if (!track) throw new Error("DualSlider track not found");
    mockTrackRect(track);
    fireEvent.wheel(track, { deltaY: 100, clientX: 10 });
    expect(onChange).not.toHaveBeenCalled();
  });
  it("cancels the wheel event so scrollable parents do not scroll", () => {
    const { track } = renderDual([3, 7]);
    const event = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      deltaY: 100,
      clientX: 10,
    });
    track.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });
});
