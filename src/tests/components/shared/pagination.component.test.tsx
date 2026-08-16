import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";

import Pagination from "@/components/shared/pagination.component";
import { useSettingsStore } from "@/store/settings.store";

beforeEach(() => {
  useSettingsStore.setState({ language: "ru" });
});

const base = {
  total: 50,
  page: 2,
  lastPage: 5,
  from: 11,
  to: 20,
  statusText: "Результаты",
};

afterEach(cleanup);

describe("Pagination", () => {
  it("disables prev on the first page and next on the last page", () => {
    const first = render(
      <Pagination {...base} page={1} onPageChange={vi.fn()} />
    );
    const [prev, next] = first.getAllByRole("button") as HTMLButtonElement[];
    expect(prev.disabled).toBe(true);
    expect(next.disabled).toBe(false);

    cleanup();
    const last = render(
      <Pagination {...base} page={5} onPageChange={vi.fn()} />
    );
    const [prevLast, nextLast] = last.getAllByRole(
      "button"
    ) as HTMLButtonElement[];
    expect(prevLast.disabled).toBe(false);
    expect(nextLast.disabled).toBe(true);
  });

  it("calls onPageChange with the adjacent page on arrow clicks", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Pagination {...base} onPageChange={onChange} />);
    const [prev, next] = screen.getAllByRole("button");
    await user.click(prev);
    expect(onChange).toHaveBeenCalledWith(1);
    await user.click(next);
    expect(onChange).toHaveBeenCalledWith(3);
  });

  it("clamps typed page numbers to lastPage", () => {
    const onChange = vi.fn();
    render(<Pagination {...base} page={1} onPageChange={onChange} />);
    const input = screen.getByRole("spinbutton");
    fireEvent.change(input, { target: { value: "99" } });
    expect(onChange).toHaveBeenLastCalledWith(5);
    fireEvent.change(input, { target: { value: "0" } });
    expect(onChange).not.toHaveBeenCalledWith(0);
  });

  it("shows the visible range only when there are results", () => {
    render(<Pagination {...base} onPageChange={vi.fn()} />);
    expect(screen.getByText("Показано с 11 по 20 из 50")).toBeTruthy();

    cleanup();
    render(<Pagination {...base} total={0} onPageChange={vi.fn()} />);
    expect(screen.queryByText(/Показано:/)).toBeNull();
  });
});
