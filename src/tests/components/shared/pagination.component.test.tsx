import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import Pagination from "@/components/shared/pagination.component";
import { useSettingsStore } from "@/store/settings.store";

function renderPagination(
  props: Partial<{
    page: number;
    scrollRef: React.RefObject<HTMLElement | null>;
    onPageChange: (page: number) => void;
  }> = {}
) {
  const onPageChange = props.onPageChange ?? vi.fn();
  render(
    <Pagination
      total={100}
      page={props.page ?? 1}
      lastPage={10}
      from={1}
      to={10}
      onPageChange={onPageChange}
      scrollRef={props.scrollRef}
    />
  );
  return { onPageChange };
}

beforeEach(() => {
  useSettingsStore.setState({ language: "en" });
});

afterEach(() => {
  cleanup();
});

describe("Pagination scrollRef", () => {
  it("changes page without scrolling when no scrollRef is given", () => {
    const { onPageChange } = renderPagination({ page: 2 });
    fireEvent.click(screen.getByLabelText("Next page"));
    expect(onPageChange).toHaveBeenCalledWith(3);
  });

  it("scrolls the list to top on page change", () => {
    const scroller = document.createElement("div");
    const scrollTo = vi.fn();
    scroller.scrollTo = scrollTo;
    const { onPageChange } = renderPagination({
      page: 2,
      scrollRef: { current: scroller },
    });

    fireEvent.click(screen.getByLabelText("Next page"));
    expect(onPageChange).toHaveBeenCalledWith(3);
    expect(scrollTo).toHaveBeenCalledWith(0, 0);
  });

  it("clamps typed page numbers to the last page", () => {
    const { onPageChange } = renderPagination({ page: 1 });
    fireEvent.change(screen.getByLabelText("Page 1 of 10"), { target: { value: "99" } });
    expect(onPageChange).toHaveBeenCalledWith(10);
  });
});
