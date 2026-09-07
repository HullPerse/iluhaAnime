import { render, cleanup, fireEvent } from "@testing-library/react";
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";

import Slider from "@/components/ui/range.component";

afterEach(cleanup);

function rect(width = 100): DOMRect {
  return {
    bottom: 20,
    height: 20,
    left: 0,
    right: width,
    toJSON: () => ({}),
    top: 0,
    width,
    x: 0,
    y: 0,
  } as DOMRect;
}

function renderSlider(onChange: (v: number) => void) {
  const view = render(<Slider min={0} max={100} step={10} value={50} onChange={onChange} />);
  const track = view.container.querySelector(".windows95-border") as HTMLElement;
  track.getBoundingClientRect = () => rect();
  return track;
}

describe("Slider", () => {
  it("snaps the value to the step from the pointer position", () => {
    const onChange = vi.fn();
    const track = renderSlider(onChange);
    fireEvent.mouseDown(track, { clientX: 57 });
    expect(onChange).toHaveBeenCalledWith(60);
  });

  it("clamps to the minimum and maximum", () => {
    const onChange = vi.fn();
    const track = renderSlider(onChange);
    fireEvent.mouseDown(track, { clientX: 250 });
    expect(onChange).toHaveBeenLastCalledWith(100);
    fireEvent.mouseDown(track, { clientX: -30 });
    expect(onChange).toHaveBeenLastCalledWith(0);
  });

  it("continues updating while dragging across the track", () => {
    const onChange = vi.fn();
    const track = renderSlider(onChange);
    fireEvent.mouseDown(track, { clientX: 30 });
    expect(onChange).toHaveBeenLastCalledWith(30);
    fireEvent.mouseMove(window, { clientX: 77 });
    expect(onChange).toHaveBeenLastCalledWith(80);
    fireEvent.mouseMove(window, { clientX: 104 });
    expect(onChange).toHaveBeenLastCalledWith(100);
  });

  it("saturates the display at the edges for out-of-range values", () => {
    const high = render(<Slider min={2} max={64} step={1} value={256} onChange={vi.fn()} />);
    const highTrack = high.container.querySelector('[role="slider"]') as HTMLElement;
    expect(highTrack.getAttribute("aria-valuenow")).toBe("64");
    expect((highTrack.querySelector(".bg-highlight") as HTMLElement).style.width).toBe("100%");
    high.unmount();
    const low = render(<Slider min={2} max={64} step={1} value={-5} onChange={vi.fn()} />);
    const lowTrack = low.container.querySelector('[role="slider"]') as HTMLElement;
    expect(lowTrack.getAttribute("aria-valuenow")).toBe("2");
    expect((lowTrack.querySelector(".bg-highlight") as HTMLElement).style.width).toBe("0%");
  });

  it("steps back into range from an out-of-range value", () => {
    const onChange = vi.fn();
    const view = render(<Slider min={2} max={64} step={1} value={256} onChange={onChange} />);
    const track = view.container.querySelector('[role="slider"]') as HTMLElement;
    fireEvent.keyDown(track, { key: "ArrowLeft" });
    expect(onChange).toHaveBeenCalledWith(63);
  });
});

