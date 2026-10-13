import { afterEach, describe, expect, it } from "vitest";

import { focusMainSearch } from "@/lib/hotkeys/focus.hotkeys";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("focusMainSearch", () => {
  it("focuses the main search input and reports success", () => {
    document.body.innerHTML =
      '<button type="button">other</button><input data-main-search type="text">';
    expect(focusMainSearch()).toBe(true);
    expect(document.activeElement).toBe(document.querySelector("[data-main-search]"));
  });

  it("scopes the lookup to the given root", () => {
    const root = document.createElement("div");
    root.innerHTML = '<input data-main-search type="text">';
    document.body.append(root);
    expect(focusMainSearch(root)).toBe(true);
    expect(root.querySelector("input")).toBe(document.activeElement);
  });

  it("reports failure without throwing when no main input exists", () => {
    document.body.innerHTML = '<input type="text">';
    expect(focusMainSearch()).toBe(false);
  });
});
