import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SearchFilterChips } from "@/routes/components/search/default/filterChips.search";
import type { SearchFilters } from "@/types/search";

afterEach(() => {
  cleanup();
});

const BASE: SearchFilters = {
  minSeeders: 0,
  hasMagnet: false,
  quality: "all",
  language: "all",
  sizeMin: 0,
  sizeMax: 0,
  codec: "all",
};

describe("SearchFilterChips", () => {
  it("renders nothing on empty query", () => {
    const { container } = render(<SearchFilterChips query="" filters={BASE} onChange={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing without matches", () => {
    const { container } = render(
      <SearchFilterChips query="zzz-no-match" filters={BASE} onChange={() => {}} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("shows matching chips without touching the query", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<SearchFilterChips query="seed" filters={BASE} onChange={onChange} />);
    const chip = screen.getByRole("button", { name: /10\+/ });
    expect(chip.getAttribute("aria-pressed")).toBe("false");
    await user.click(chip);
    expect(onChange).toHaveBeenCalledWith({ ...BASE, minSeeders: 10 });
  });

  it("marks active filters pressed and toggles them off", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <SearchFilterChips
        query="magnet"
        filters={{ ...BASE, hasMagnet: true }}
        onChange={onChange}
      />
    );
    const chip = screen.getByRole("button", { name: /агнит|magnet/i });
    expect(chip.getAttribute("aria-pressed")).toBe("true");
    await user.click(chip);
    expect(onChange).toHaveBeenCalledWith({ ...BASE, hasMagnet: false });
  });

  it("matches quality chips by partial text", () => {
    render(<SearchFilterChips query="1080" filters={BASE} onChange={() => {}} />);
    expect(screen.getByRole("button", { name: "1080p" })).toBeDefined();
    expect(screen.queryByRole("button", { name: "720p" })).toBeNull();
  });
});
