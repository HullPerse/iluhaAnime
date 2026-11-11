import { describe, expect, it } from "vitest";

import { barClass, rootClass } from "@/lib/player/playerChrome.utils";

describe("rootClass", () => {
  it("keeps the base frame for a playable file", () => {
    const value = rootClass({ hasFile: true, failed: false, cursorHidden: false });
    expect(value).toContain("relative flex h-screen w-screen flex-col overflow-hidden");
    expect(value).not.toContain("bg-black");
  });

  it("paints the frame black when there is no file", () => {
    expect(rootClass({ hasFile: false, failed: false, cursorHidden: false })).toContain("bg-black");
  });

  it("paints the frame black after a failure", () => {
    expect(rootClass({ hasFile: true, failed: true, cursorHidden: false })).toContain("bg-black");
  });

  it("adds the cursor class only while the cursor is hidden", () => {
    expect(rootClass({ hasFile: true, failed: false, cursorHidden: true })).toContain(
      "player-cursor-hidden"
    );
    expect(rootClass({ hasFile: true, failed: false, cursorHidden: false })).not.toContain(
      "player-cursor-hidden"
    );
  });
});

describe("barClass", () => {
  it("keeps a static bar outside immersive mode", () => {
    expect(barClass({ position: "top", immersive: false, hidden: true })).toBe(
      "z-20 shrink-0 bg-primary"
    );
  });

  it("docks an immersive bar to the requested edge", () => {
    expect(barClass({ position: "top", immersive: true, hidden: false })).toContain("top-0");
    expect(barClass({ position: "bottom", immersive: true, hidden: false })).toContain("bottom-0");
  });

  it("fades only an immersive bar when hidden", () => {
    expect(barClass({ position: "bottom", immersive: true, hidden: true })).toContain(
      "pointer-events-none opacity-0"
    );
    expect(barClass({ position: "bottom", immersive: false, hidden: true })).not.toContain(
      "opacity-0"
    );
  });
});
