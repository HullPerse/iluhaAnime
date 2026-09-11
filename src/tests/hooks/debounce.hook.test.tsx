import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { useDebounce } from "@/hooks/debounce.hook";

describe("useDebounce", () => {
  function Probe(props: { value: string; delay: number }) {
    const debounced = useDebounce(props.value, props.delay);
    return createElement("span", null, debounced);
  }

  it("returns the initial value immediately on first render", () => {
    const html = renderToStaticMarkup(createElement(Probe, { delay: 300, value: "hello" }));
    expect(html).toBe("<span>hello</span>");
  });

  it("handles the zero-delay case without crashing", () => {
    const html = renderToStaticMarkup(createElement(Probe, { delay: 0, value: "x" }));
    expect(html).toBe("<span>x</span>");
  });
});
