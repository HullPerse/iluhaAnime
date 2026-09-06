import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StatusCollection } from "@/routes/components/collection/status.collection";
import { useSettingsStore } from "@/store/settings.store";
import type { CollectionStatus, CollectionStatusDef } from "@/types/collection";

const STATUSES: CollectionStatusDef[] = [
  { id: "planned", label: "Planned", color: "#9ca3af", order: 0, isCore: false },
  { id: "watching", label: "Watching", color: "#3b82f6", order: 1, isCore: false },
  { id: "completed", label: "Completed", color: "#22c55e", order: 2, isCore: false },
];

const proto = Element.prototype as unknown as Record<string, unknown>;
const origScrollBy = proto.scrollBy;
const origScrollIntoView = proto.scrollIntoView;

function renderStrip(selectedStatus: CollectionStatus | "all" = "all") {
  const onSelect = vi.fn();
  const view = render(
    <StatusCollection statuses={STATUSES} selectedStatus={selectedStatus} onSelect={onSelect} />
  );
  return { onSelect, strip: view.container.querySelector(".overflow-x-auto") as HTMLElement };
}

function mockOverflow(
  el: HTMLElement,
  { scrollLeft = 0, clientWidth = 100, scrollWidth = 300 } = {}
) {
  Object.defineProperties(el, {
    scrollLeft: { value: scrollLeft, writable: true, configurable: true },
    clientWidth: { value: clientWidth, configurable: true },
    scrollWidth: { value: scrollWidth, configurable: true },
  });
}

beforeEach(() => {
  useSettingsStore.setState({ language: "en" });
});

afterEach(() => {
  proto.scrollBy = origScrollBy;
  proto.scrollIntoView = origScrollIntoView;
  cleanup();
});

describe("StatusCollection overflow", () => {
  it("hides scroll arrows when tabs fit", () => {
    renderStrip();
    expect(screen.queryByLabelText("Previous")).toBeNull();
    expect(screen.queryByLabelText("Next")).toBeNull();
  });

  it("shows the next arrow on overflow and scrolls forward on click", () => {
    const { strip } = renderStrip();
    mockOverflow(strip, { scrollWidth: 500 });
    fireEvent.scroll(strip);

    const next = screen.getByLabelText("Next");
    proto.scrollBy = vi.fn();
    fireEvent.click(next);
    expect(proto.scrollBy).toHaveBeenCalledWith({
      left: 200,
      behavior: "smooth",
    });
  });
  it("shows the previous arrow once scrolled right", () => {
    const { strip } = renderStrip();
    mockOverflow(strip, { scrollLeft: 100, scrollWidth: 500 });
    fireEvent.scroll(strip);

    expect(screen.getByLabelText("Previous")).not.toBeNull();
  });

  it("scrolls the selected tab into view", () => {
    const scrollIntoView = vi.fn();
    proto.scrollIntoView = scrollIntoView;
    const { rerender } = render(
      <StatusCollection statuses={STATUSES} selectedStatus="planned" onSelect={vi.fn()} />
    );
    expect(scrollIntoView).toHaveBeenCalledTimes(1);

    rerender(
      <StatusCollection statuses={STATUSES} selectedStatus="completed" onSelect={vi.fn()} />
    );
    expect(scrollIntoView).toHaveBeenCalledTimes(2);
  });
});
