import { describe, expect, it } from "vitest";

import { cardClass } from "@/lib/player/playlist.utils";

describe("cardClass", () => {
  it("uses active colours for the current card", () => {
    const value = cardClass({ current: true, focused: false, isOver: false });
    expect(value).toContain("windows95-active-border bg-secondary text-primary");
  });

  it("uses field colours for another card", () => {
    expect(cardClass({ current: false, focused: false, isOver: false })).toContain(
      "bg-field hover:bg-surface"
    );
  });

  it("marks focus and the drop target independently", () => {
    expect(cardClass({ current: false, focused: true, isOver: false })).toContain(
      "outline-secondary outline-2"
    );
    expect(cardClass({ current: false, focused: false, isOver: true })).toContain(
      "outline-highlight outline-2"
    );
  });

  it("lets the drop target outline win over focus when both apply", () => {
    const both = cardClass({ current: false, focused: true, isOver: true });
    expect(both).toContain("outline-highlight outline-2");
    expect(both).not.toContain("outline-secondary");
  });
});
