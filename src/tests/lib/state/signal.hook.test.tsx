import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useCell, useDerived } from "@/lib/state/signal.hook";
import { createSignalStore } from "@/lib/state/signal.store";

describe("useCell", () => {
  it("renders the current value and updates on set", () => {
    const store = createSignalStore();
    const cell = store.cell(1);
    const { result } = renderHook(() => useCell(cell));
    expect(result.current).toBe(1);
    act(() => cell.set(2));
    expect(result.current).toBe(2);
  });

  it("stops updating after unmount", () => {
    const store = createSignalStore();
    const cell = store.cell(1);
    let renders = 0;
    const { result, unmount } = renderHook(() => {
      renders++;
      return useCell(cell);
    });
    const before = renders;
    unmount();
    act(() => cell.set(2));
    expect(renders).toBe(before);
    expect(result.current).toBe(1);
  });

  it("ignores updates of other atoms", () => {
    const store = createSignalStore();
    const listed = store.cell(1);
    const other = store.cell(0);
    let renders = 0;
    const { result } = renderHook(() => {
      renders++;
      return useCell(listed);
    });
    const before = renders;
    act(() => {
      other.set(1);
      other.set(2);
    });
    expect(result.current).toBe(1);
    expect(renders).toBe(before);
  });
});

describe("useDerived", () => {
  it("follows the derived value", () => {
    const store = createSignalStore();
    const first = store.cell("a");
    const second = store.cell(1);
    const label = store.derive([first, second], (args) => `${args[0]}:${args[1]}`);
    const { result } = renderHook(() => useDerived(label));
    expect(result.current).toBe("a:1");
    act(() => first.set("b"));
    expect(result.current).toBe("b:1");
    act(() => second.set(2));
    expect(result.current).toBe("b:2");
  });
});
