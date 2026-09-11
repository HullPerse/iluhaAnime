import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";

import Select from "@/components/ui/select.component";
import { useSettingsStore } from "@/store/settings.store";

beforeEach(() => {
  useSettingsStore.setState({ language: "ru" });
});

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

const OPTIONS = [
  { value: "action", label: "Action" },
  { value: "comedy", label: "Comedy" },
  { value: "drama", label: "Drama" },
  { value: "fantasy", label: "Fantasy" },
  { value: "horror", label: "Horror" },
  { value: "romance", label: "Romance" },
  { value: "scifi", label: "Sci-Fi" },
  { value: "slice", label: "Slice of Life" },
  { value: "sports", label: "Sports" },
  { value: "thriller", label: "Thriller" },
];

describe("Select", () => {
  it("shows a search input when there are many options", async () => {
    const user = userEvent.setup();
    render(<Select value="" onChange={vi.fn()} options={OPTIONS} />);
    await user.click(screen.getByRole("combobox"));
    expect(screen.getByPlaceholderText("Поиск...")).toBeTruthy();
  });

  it("filters options by typed text", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<Select value="" onChange={vi.fn()} options={OPTIONS} />);
    await user.click(screen.getByRole("combobox"));
    const search = screen.getByPlaceholderText("Поиск...") as HTMLInputElement;
    fireEvent.change(search, { target: { value: "fan" } });
    expect(search.value).toBe("fan");
    await screen.findByText("Fantasy");
    expect(screen.queryByText("Action")).toBeNull();
  });

  it("reports the selected value", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Select value="" onChange={onChange} options={OPTIONS} />);
    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByText("Drama"));
    expect(onChange).toHaveBeenCalledWith("drama");
  });
});
