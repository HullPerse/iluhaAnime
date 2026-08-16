import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { useDebounce } from "@/hooks/debounce.hook";
import { usePagination } from "@/hooks/pagination.hook";
import type { PaginationResult } from "@/types";

describe("usePagination", () => {
  function Probe(props: {
    totalItems: number;
    pageSize: number;
    page: number;
    setPage: (page: number) => void;
  }) {
    const result = usePagination(
      props.totalItems,
      props.pageSize,
      props.page,
      props.setPage
    );
    return createElement(
      "span",
      null,
      [result.total, result.from, result.to, result.lastPage, result.page].join(
        ":"
      )
    );
  }

  function render(args: {
    totalItems: number;
    pageSize: number;
    page: number;
    setPage?: (page: number) => void;
  }) {
    return renderToStaticMarkup(
      createElement(Probe, {
        page: args.page,
        pageSize: args.pageSize,
        setPage: args.setPage ?? (() => {}),
        totalItems: args.totalItems,
      })
    );
  }

  it("computes totals, ranges and last page", () => {
    expect(render({ page: 1, pageSize: 10, totalItems: 25 })).toBe(
      "<span>25:1:10:3:1</span>"
    );
    expect(render({ page: 2, pageSize: 10, totalItems: 25 })).toBe(
      "<span>25:11:20:3:2</span>"
    );
    expect(render({ page: 3, pageSize: 10, totalItems: 25 })).toBe(
      "<span>25:21:25:3:3</span>"
    );
  });

  it("clamps the displayed page to the last page", () => {
    expect(render({ page: 4, pageSize: 10, totalItems: 5 })).toBe(
      "<span>5:1:5:1:1</span>"
    );
  });

  it("handles empty collections with zero range", () => {
    expect(render({ page: 1, pageSize: 10, totalItems: 0 })).toBe(
      "<span>0:0:0:1:1</span>"
    );
  });

  it("clamps page requests through setPage", () => {
    const calls: number[] = [];
    let captured: PaginationResult | null = null;
    function Capture() {
      captured = usePagination(25, 10, 1, (p) => calls.push(p));
      return null;
    }
    renderToStaticMarkup(createElement(Capture));
    captured!.setPage(99);
    captured!.setPage(-5);
    captured!.setPage(2);
    expect(calls).toEqual([3, 1, 2]);
  });

  it("returns a PaginationResult-shaped object", () => {
    let captured: PaginationResult | null = null;
    function Capture() {
      captured = usePagination(10, 5, 1, () => {});
      return null;
    }
    renderToStaticMarkup(createElement(Capture));
    expect(captured).not.toBeNull();
    expect(captured!.total).toBe(10);
    expect(captured!.lastPage).toBe(2);
    expect(captured!.setPage).toBeTypeOf("function");
  });
});

describe("useDebounce", () => {
  function Probe(props: { value: string; delay: number }) {
    const debounced = useDebounce(props.value, props.delay);
    return createElement("span", null, debounced);
  }

  it("returns the initial value immediately on first render", () => {
    const html = renderToStaticMarkup(
      createElement(Probe, { delay: 300, value: "hello" })
    );
    expect(html).toBe("<span>hello</span>");
  });

  it("handles the zero-delay case without crashing", () => {
    const html = renderToStaticMarkup(
      createElement(Probe, { delay: 0, value: "x" })
    );
    expect(html).toBe("<span>x</span>");
  });
});
