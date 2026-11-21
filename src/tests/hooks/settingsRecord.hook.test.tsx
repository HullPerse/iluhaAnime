import { act, cleanup, renderHook } from "@testing-library/react";
import { createSignalStore } from "@hullperse/hp_utils/signal";
import { afterEach, describe, expect, it } from "vitest";

import { useRecordValue } from "@/hooks/settingsRecord.hook";

afterEach(cleanup);

describe("useRecordValue", () => {
  it("updates only when the requested key changes", () => {
    const store = createSignalStore();
    const cell = store.cell<Record<string, number>>({ anime: 320, other: 240 });
    let renders = 0;
    const { result } = renderHook(() => {
      renders++;
      return useRecordValue(cell, "anime");
    });

    expect(result.current).toBe(320);
    const before = renders;

    act(() => cell.set({ anime: 320, other: 480 }));
    expect(result.current).toBe(320);
    expect(renders).toBe(before);

    act(() => cell.set({ anime: 420, other: 480 }));
    expect(result.current).toBe(420);
    expect(renders).toBeGreaterThan(before);
  });

  it("follows the key when it changes", () => {
    const store = createSignalStore();
    const cell = store.cell<Record<string, number>>({ anime: 320, other: 240 });
    const { result, rerender } = renderHook(
      ({ key }: { key: string }) => useRecordValue(cell, key),
      { initialProps: { key: "anime" } }
    );

    rerender({ key: "other" });
    expect(result.current).toBe(240);

    act(() => cell.set({ anime: 320 }));
    expect(result.current).toBeUndefined();
  });
});
