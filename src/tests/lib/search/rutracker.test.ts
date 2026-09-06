import { describe, expect, it } from "vitest";

import { mapError } from "@/lib/search/rutracker.utils";

const identity = (key: string) => key;

describe("mapError", () => {
  it("maps the blocked code to the anti-bot hint", () => {
    expect(mapError("blocked: anti-bot challenge on rutracker", identity)).toBe(
      "search.rutracker.err.blocked"
    );
  });

  it("maps the wrong-credentials code without the detail", () => {
    expect(mapError("wrong_credentials", identity)).toBe("search.rutracker.err.wrong.credentials");
  });

  it("appends the detail to the network label", () => {
    expect(mapError("network: Connection failed: timeout", identity)).toBe(
      "search.rutracker.err.network\nConnection failed: timeout"
    );
  });

  it("falls back to the unknown label for new codes", () => {
    expect(mapError("something_new: detail", identity)).toBe("search.rutracker.err.unknown");
  });
});
