// @vitest-environment jsdom

import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import Image from "@/components/ui/image.component";

afterEach(() => {
  cleanup();
});

function currentImg(container: HTMLElement): HTMLImageElement | null {
  return container.querySelector('img:not([aria-hidden])');
}

describe("Image stale error guard", () => {
  it("ignores a late error from the previous src", () => {
    const { container, rerender } = render(
      <Image src="https://img/a.jpg" alt="a" className="h-10" />
    );
    rerender(<Image src="https://img/b.jpg" alt="b" className="h-10" />);
    const img = currentImg(container);
    expect(img?.getAttribute("src")).toBe("https://img/b.jpg");
    img?.setAttribute("src", "https://img/a.jpg");
    fireEvent.error(img as HTMLImageElement);
    expect(container.querySelector('[role="img"]')).toBeNull();
    expect(currentImg(container)?.getAttribute("src")).toBe("https://img/a.jpg");
  });

  it("falls back after repeated errors from the current src", () => {
    const { container } = render(<Image src="https://img/b.jpg" alt="b" className="h-10" />);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const img = currentImg(container);
      if (!img) break;
      fireEvent.error(img);
    }
    expect(container.querySelector('[role="img"]')).not.toBeNull();
  });
});
