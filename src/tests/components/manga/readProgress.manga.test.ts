import { expect, it } from "vitest";
import { mangaReadProgress } from "@/lib/manga/library.utils";

it("sorts by the share of known chapters read and treats missing totals as zero progress", () => {
  expect(mangaReadProgress({ read: 0, unread: 0 })).toBe(0);
  expect(mangaReadProgress({ read: 3, unread: 2 })).toBe(0.6);
  expect(mangaReadProgress({ read: 5, unread: 0 })).toBe(1);
});
