import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { useReaderScrollFade } from "@/hooks/manga/reader/scrollFade.hook";

let dialog: HTMLDialogElement | null = null;

afterEach(() => {
  cleanup();
  dialog?.remove();
  dialog = null;
});

function makeScroller(scrollTop = 30): HTMLDivElement {
  const scroller = document.createElement("div");
  scroller.dataset.readerScroll = "";
  Object.defineProperties(scroller, {
    clientHeight: { value: 200, configurable: true },
    scrollHeight: { value: 1000, configurable: true },
    scrollTop: { value: scrollTop, writable: true, configurable: true },
  });

  return scroller;
}

it("masks the reader scroller and follows a replaced stage container", async () => {
  const node = document.createElement("dialog");
  dialog = node;
  const scroller = makeScroller();
  node.append(scroller);
  document.body.append(node);

  const { rerender, unmount } = renderHook(
    ({ enabled }) => useReaderScrollFade({ current: node }, { enabled, ready: true }),
    { initialProps: { enabled: true } }
  );

  expect(scroller.style.maskImage).toContain("30px");
  expect(scroller.style.maskImage).toContain("40px");

  scroller.scrollTop = 35;
  scroller.dispatchEvent(new Event("scroll"));
  expect(scroller.style.maskImage).toContain("35px");

  const replacement = makeScroller(0);
  scroller.remove();
  node.append(replacement);
  await waitFor(() => expect(replacement.style.maskImage).toContain("linear-gradient"));

  rerender({ enabled: false });
  expect(replacement.style.maskImage).toBe("");
  unmount();
});
