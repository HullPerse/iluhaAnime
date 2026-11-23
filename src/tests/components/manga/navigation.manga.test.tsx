import { act, renderHook } from "@testing-library/react";
import { expect, it } from "vitest";
import { useReaderNavigation } from "@/hooks/manga/reader/navigation.hook";
import type { MangaChapter } from "@/api/manga.api";

const chapter = (id: string): MangaChapter => ({
  id,
  key: id,
  number: id,
  volume: null,
  title: null,
  language: "ru",
  group: null,
  locked: false,
  lockReason: null,
  availableAt: null,
  branch: null,
});

it("restores page jumps and chapter visits, replaces forward history after a new visit and clears on close", () => {
  const { result } = renderHook(() => useReaderNavigation());
  const first = chapter("1");
  const second = chapter("2");
  act(() => result.current.visit(first));
  act(() => result.current.position(7));
  act(() => result.current.visit(first, 20));
  act(() => result.current.position(22));
  act(() => result.current.visit(second));
  act(() => result.current.position(4));
  act(() => result.current.move(-1));
  expect([result.current.chapter?.id, result.current.page]).toEqual(["1", 22]);
  act(() => result.current.move(-1));
  expect([result.current.chapter?.id, result.current.page]).toEqual(["1", 7]);
  const token = result.current.token;
  act(() => result.current.move(-1));
  expect(result.current.token).toBe(token);
  act(() => result.current.move(1));
  expect(result.current.page).toBe(22);
  act(() => result.current.visit(first, 30));
  act(() => result.current.move(1));
  expect(result.current.chapter?.id).toBe("1");
  expect(result.current.page).toBe(30);
  act(() => result.current.visit(null));
  act(() => result.current.move(-1));
  expect(result.current.chapter).toBeNull();
});
