import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { usePagination } from "@/hooks/pagination.hook";
import type { PaginationResult } from "@/types/pagination";

describe("usePagination", () => {
  function Probe(props: {
    totalItems: number;
    pageSize: number;
    page: number;
    setPage: (page: number) => void;
  }) {
    const result = usePagination(props.totalItems, props.pageSize, props.page, props.setPage);
    return createElement(
      "span",
      null,
      [result.total, result.from, result.to, result.lastPage, result.page].join(":")
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
    expect(render({ page: 1, pageSize: 10, totalItems: 25 })).toBe("<span>25:1:10:3:1</span>");
    expect(render({ page: 2, pageSize: 10, totalItems: 25 })).toBe("<span>25:11:20:3:2</span>");
    expect(render({ page: 3, pageSize: 10, totalItems: 25 })).toBe("<span>25:21:25:3:3</span>");
  });

  it("clamps the displayed page to the last page", () => {
    expect(render({ page: 4, pageSize: 10, totalItems: 5 })).toBe("<span>5:1:5:1:1</span>");
  });

  it("handles empty collections with zero range", () => {
    expect(render({ page: 1, pageSize: 10, totalItems: 0 })).toBe("<span>0:0:0:1:1</span>");
  });

  it("clamps page requests through setPage", () => {
    const calls: number[] = [];
    const holder: { current: PaginationResult | null } = { current: null };
    function Capture() {
      holder.current = usePagination(25, 10, 1, (p) => calls.push(p));
      return null;
    }
    renderToStaticMarkup(createElement(Capture));
    holder.current!.setPage(99);
    holder.current!.setPage(-5);
    holder.current!.setPage(2);
    expect(calls).toEqual([3, 1, 2]);
  });

  it("returns a PaginationResult-shaped object", () => {
    const holder: { current: PaginationResult | null } = { current: null };
    function Capture() {
      holder.current = usePagination(10, 5, 1, () => {});
      return null;
    }
    renderToStaticMarkup(createElement(Capture));
    expect(holder.current).not.toBeNull();
    expect(holder.current!.total).toBe(10);
    expect(holder.current!.lastPage).toBe(2);
    expect(holder.current!.setPage).toBeTypeOf("function");
  });
});

