// @vitest-environment jsdom

import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { useFranchiseViewport } from "@/hooks/anilist/franchise.hook";

afterEach(() => {
  cleanup();
});

function LateMountProbe() {
  const viewport = useFranchiseViewport();
  const [show, setShow] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setShow(true)}>
        mount
      </button>
      {show ? (
        <div
          data-testid="viewport"
          data-transform={viewport.transformStyle.transform}
          {...viewport.wrapperProps}
        />
      ) : null}
    </>
  );
}

describe("useFranchiseViewport", () => {
  it("zooms on wheel when the wrapper mounts after data", async () => {
    const { getByRole, getByTestId } = render(<LateMountProbe />);
    fireEvent.click(getByRole("button", { name: "mount" }));
    const box = getByTestId("viewport");
    expect(box.dataset.transform).toContain("scale(0.4)");
    fireEvent.wheel(box, { deltaY: -100, clientX: 10, clientY: 10 });
    await waitFor(() => {
      expect(getByTestId("viewport").dataset.transform).toContain("scale(0.44");
    });
  });
  it("coalesces a pan burst into the latest position", async () => {
    const { getByRole, getByTestId } = render(<LateMountProbe />);
    fireEvent.click(getByRole("button", { name: "mount" }));
    const box = getByTestId("viewport");
    fireEvent.mouseDown(box, { button: 0, clientX: 0, clientY: 0 });
    fireEvent.mouseMove(window, { clientX: 20, clientY: 0 });
    fireEvent.mouseMove(window, { clientX: 30, clientY: 0 });
    await waitFor(() => {
      expect(getByTestId("viewport").dataset.transform).toContain("30px");
    });
    fireEvent.mouseUp(window);
  });
});
