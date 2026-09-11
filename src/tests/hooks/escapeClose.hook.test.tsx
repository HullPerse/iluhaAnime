import { renderHook } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";

import { useEscapeClose } from "@/hooks/escapeClose.hook";

describe("useEscapeClose", () => {
  it("calls onClose on Escape when enabled", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderHook(() => useEscapeClose(onClose, true));
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does nothing when disabled", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderHook(() => useEscapeClose(onClose, false));
    await user.keyboard("{Escape}");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("does not fire on other keys", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderHook(() => useEscapeClose(onClose, true));
    await user.keyboard("{Enter}");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("unsubscribes when disabled flips to false", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const { rerender } = renderHook(({ enabled }) => useEscapeClose(onClose, enabled), {
      initialProps: { enabled: true },
    });
    rerender({ enabled: false });
    await user.keyboard("{Escape}");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("uses the latest callback on re-render", async () => {
    const user = userEvent.setup();
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(({ cb }) => useEscapeClose(cb, true), {
      initialProps: { cb: first },
    });
    rerender({ cb: second });
    await user.keyboard("{Escape}");
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
