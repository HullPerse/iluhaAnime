import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { BootPending, readFastLaunch } from "@/components/shared/bootPending.component";

afterEach(() => {
  cleanup();
});

const stored = (fastLaunch: unknown): string => {
  return JSON.stringify({ f: 1, store: "settings", sv: 45, ts: 1, data: { fastLaunch } });
};

describe("BootPending", () => {
  it("reads the persisted fast-launch flag", () => {
    localStorage.clear();
    expect(readFastLaunch()).toBe(false);
    localStorage.setItem("iluha.v1.settings", stored(true));
    expect(readFastLaunch()).toBe(true);
    localStorage.setItem("iluha.v1.settings", stored(false));
    expect(readFastLaunch()).toBe(false);
    localStorage.setItem("iluha.v1.settings", "{broken");
    expect(readFastLaunch()).toBe(false);
  });

  it("renders nothing when the splash will show", () => {
    localStorage.clear();
    const { container } = render(<BootPending />);
    expect(container.innerHTML).toBe("");
  });

  it("renders the big loader for fast launch", () => {
    localStorage.setItem("iluha.v1.settings", stored(true));
    const { container } = render(<BootPending />);
    expect(container.querySelector("svg")).not.toBeNull();
  });
});
