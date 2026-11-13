import { describe, expect, it } from "vitest";

import {
  BINDER_PAGE_SIZE,
  binderPocketIndex,
  buildBinderPage,
} from "@/lib/cards/binder.utils";

describe("binder utils", () => {
  it("keeps twelve pockets and clamps an empty collection to page zero", () => {
    const page = buildBinderPage([], 4);
    expect(page.page).toBe(0);
    expect(page.pageCount).toBe(0);
    expect(page.from).toBe(0);
    expect(page.to).toBe(0);
    expect(page.slots).toHaveLength(BINDER_PAGE_SIZE);
    expect(page.slots.every((slot) => slot === null)).toBe(true);
  });

  it("pads one card and a full page without moving the card", () => {
    const one = buildBinderPage(["a"], 0);
    expect(one.slots[0]).toBe("a");
    expect(one.slots.slice(1).every((slot) => slot === null)).toBe(true);
    expect(one.from).toBe(1);
    expect(one.to).toBe(1);

    const full = buildBinderPage(Array.from({ length: 12 }, (_, index) => index), 0);
    expect(full.slots).toEqual(Array.from({ length: 12 }, (_, index) => index));
    expect(full.pageCount).toBe(1);
    expect(full.to).toBe(12);
  });

  it("moves the thirteenth card to the second page", () => {
    const items = Array.from({ length: 13 }, (_, index) => index);
    const first = buildBinderPage(items, 0);
    const second = buildBinderPage(items, 1);
    expect(first.slots[11]).toBe(11);
    expect(second.slots[0]).toBe(12);
    expect(second.page).toBe(1);
    expect(second.pageCount).toBe(2);
    expect(second.from).toBe(13);
    expect(second.to).toBe(13);
  });

  it("clamps a hundred cards to the last page and keeps pocket indexes stable", () => {
    const items = Array.from({ length: 100 }, (_, index) => index);
    const page = buildBinderPage(items, 99);
    expect(page.page).toBe(8);
    expect(page.pageCount).toBe(9);
    expect(page.slots[0]).toBe(96);
    expect(page.slots[3]).toBe(99);
    expect(page.slots[4]).toBeNull();
    expect(binderPocketIndex(0, 0)).toBe(0);
    expect(binderPocketIndex(3, 2)).toBe(11);
  });

  it("rejects a non-positive page size", () => {
    expect(() => buildBinderPage([], 0, 0)).toThrow("positive integer");
    expect(() => buildBinderPage([], 0, 1.5)).toThrow("positive integer");
  });
});
