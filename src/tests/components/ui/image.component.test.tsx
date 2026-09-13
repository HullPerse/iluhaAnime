import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import Image from "@/components/ui/image.component";
import { useSettingsStore } from "@/store/settings.store";

function renderImage(src = "asset://localhost/cover.jpg") {
  useSettingsStore.setState({ language: "en" });
  return render(<Image src={src} alt="Cover" className="h-10 w-10" />);
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("Image", () => {
  it("renders the image without leaking the referrer and without a webp source", () => {
    renderImage();
    const img = screen.getByAltText("Cover");
    expect(img.getAttribute("src")).toBe("asset://localhost/cover.jpg");
    expect(img.getAttribute("referrerpolicy")).toBe("no-referrer");
    expect(document.querySelector("source")).toBeNull();
  });

  it("shows a shimmer while loading and hides it after load", () => {
    const { container } = renderImage();
    expect(container.querySelector(".animate-pulse")).not.toBeNull();
    fireEvent.load(screen.getByAltText("Cover"));
    expect(container.querySelector(".animate-pulse")).toBeNull();
    expect(screen.getByAltText("Cover").className).toContain("opacity-100");
  });

  it("retries twice with backoff and then shows the fallback", () => {
    const { container } = renderImage();
    fireEvent.error(screen.getByAltText("Cover"));
    act(() => {
      vi.advanceTimersByTime(499);
    });
    expect(screen.queryByText("Image")).toBeNull();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    fireEvent.error(screen.getByAltText("Cover"));
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    fireEvent.error(screen.getByAltText("Cover"));
    expect(screen.getByText("Image")).not.toBeNull();
    expect(container.querySelector("img")).toBeNull();
  });

  it("shows the image again when the source changes after a failure", () => {
    const view = renderImage();
    fireEvent.error(screen.getByAltText("Cover"));
    act(() => {
      vi.advanceTimersByTime(500);
    });
    fireEvent.error(screen.getByAltText("Cover"));
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    fireEvent.error(screen.getByAltText("Cover"));
    expect(screen.getByText("Image")).not.toBeNull();
    view.rerender(<Image src="asset://localhost/other.jpg" alt="Cover" className="h-10 w-10" />);
    const img = screen.getByAltText("Cover");
    expect(img.getAttribute("src")).toBe("asset://localhost/other.jpg");
  });
});
