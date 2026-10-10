import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import SearchPager from "@/routes/components/search/default/pager.search";

afterEach(cleanup);

function renderPager(props?: {
  page?: number;
  pageFull?: boolean;
  isLoading?: boolean;
  onPageChange?: (page: number) => void;
}) {
  return render(
    <SearchPager
      page={props?.page ?? 2}
      pageFull={props?.pageFull ?? true}
      isLoading={props?.isLoading ?? false}
      shown={20}
      resultsPerPage={20}
      onPageChange={props?.onPageChange ?? vi.fn()}
    />
  );
}

describe("SearchPager", () => {
  it("disables next on a short page", () => {
    renderPager({ pageFull: false });
    expect((screen.getByRole("button", { name: "Next page" }) as HTMLButtonElement).disabled).toBe(
      true
    );
    expect(
      (screen.getByRole("button", { name: "Previous page" }) as HTMLButtonElement).disabled
    ).toBe(false);
  });

  it("steps pages through the shared pagination", async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    renderPager({ onPageChange });
    await user.click(screen.getByRole("button", { name: "Next page" }));
    expect(onPageChange).toHaveBeenCalledWith(3);
    await user.click(screen.getByRole("button", { name: "Previous page" }));
    expect(onPageChange).toHaveBeenCalledWith(1);
  });

  it("ignores page changes while loading", async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    renderPager({ isLoading: true, onPageChange });
    await user.click(screen.getByRole("button", { name: "Next page" }));
    expect(onPageChange).not.toHaveBeenCalled();
  });
});
