import { describe, expect, it } from "vitest";
import {
  readerAutoScrollStep,
  readerImagesLoaded,
  shouldForwardReaderWheel,
} from "@/lib/manga/readerAuto.utils";

describe("shouldForwardReaderWheel", () => {
  it("keeps wheel input outside reader ui, dialogs, menus, and no-wheel zones", () => {
    const ui = document.createElement("div");
    ui.dataset.readerUi = "";
    const popup = document.createElement("div");
    popup.setAttribute("role", "dialog");
    const menu = document.createElement("div");
    menu.setAttribute("role", "menu");
    const noWheel = document.createElement("div");
    noWheel.dataset.noWheel = "";
    const plain = document.createElement("span");
    const wrapper = document.createElement("div");
    wrapper.append(ui, popup, menu, noWheel, plain);

    expect(shouldForwardReaderWheel(plain)).toBe(true);
    expect(shouldForwardReaderWheel(ui)).toBe(false);
    expect(shouldForwardReaderWheel(popup)).toBe(false);
    expect(shouldForwardReaderWheel(menu)).toBe(false);
    expect(shouldForwardReaderWheel(noWheel)).toBe(false);
    expect(shouldForwardReaderWheel(null)).toBe(false);
  });
});

describe("readerAutoScrollStep", () => {
  it("moves a few pixels per frame instead of jumping by a screen", () => {
    expect(readerAutoScrollStep(1000, 1)).toBe(120);
    expect(readerAutoScrollStep(16, 2)).toBeCloseTo(3.84);
  });
});

describe("readerImagesLoaded", () => {
  it("ignores hidden pages and loading pages outside the reading position", () => {
    const node = document.createElement("div");
    const visible = document.createElement("img");
    const hidden = document.createElement("img");
    visible.dataset.mangaImage = "0";
    hidden.dataset.mangaImage = "1";
    Object.defineProperties(visible, {
      complete: { value: true },
      naturalWidth: { value: 100 },
    });
    Object.defineProperties(hidden, {
      complete: { value: false },
      naturalWidth: { value: 0 },
    });
    const hiddenWrap = document.createElement("div");
    hiddenWrap.setAttribute("aria-hidden", "true");
    hiddenWrap.append(hidden);
    visible.getBoundingClientRect = () => new DOMRect(0, 0, 100, 100);
    hidden.getBoundingClientRect = () => new DOMRect(0, 0, 100, 100);
    node.append(visible, hiddenWrap);

    expect(readerImagesLoaded(node)).toBe(true);
  });
});
