import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import TorrentNameFilter from "@/routes/components/torrent/filter.torrent";
import { patchSettings } from "@/store/settings.store";

const NAMES = ["Naruto", "Naruto Shippuden", "Bleach"] as const;

beforeEach(() => {
  patchSettings({ language: "en" });
});

afterEach(() => {
  cleanup();
});

const renderFilter = (query: string) => {
  const onQueryChange = vi.fn();
  const { container } = render(
    <TorrentNameFilter names={NAMES} query={query} onQueryChange={onQueryChange} />
  );
  const input = screen.getByPlaceholderText("Filter...") as HTMLInputElement;
  return { container, onQueryChange, input };
};

describe("TorrentNameFilter", () => {
  it("shows the inline completion of the first matching torrent name", () => {
    const { container } = renderFilter("Na");

    expect(container.querySelector(".inline-autocomplete-ghost")).not.toBeNull();
    expect(screen.getByText("ruto")).toBeTruthy();
  });

  it("hides the completion when the query is already a full name", () => {
    const { container } = renderFilter("Naruto");

    expect(container.querySelector(".inline-autocomplete-ghost")).toBeNull();
  });

  it("hides the completion when nothing matches or the query is empty", () => {
    const noMatch = renderFilter("zzz");
    expect(noMatch.container.querySelector(".inline-autocomplete-ghost")).toBeNull();
    cleanup();

    const empty = renderFilter("");
    expect(empty.container.querySelector(".inline-autocomplete-ghost")).toBeNull();
  });

  it("accepts the completion with Tab", () => {
    const { onQueryChange, input } = renderFilter("Na");

    fireEvent.keyDown(input, { key: "Tab" });

    expect(onQueryChange).toHaveBeenCalledWith("Naruto");
  });

  it("accepts the completion with ArrowRight at the caret end", () => {
    const { onQueryChange, input } = renderFilter("Na");
    input.setSelectionRange(2, 2);

    fireEvent.keyDown(input, { key: "ArrowRight" });

    expect(onQueryChange).toHaveBeenCalledWith("Naruto");
  });

  it("keeps Shift+Tab for focus navigation", () => {
    const { onQueryChange, input } = renderFilter("Na");

    fireEvent.keyDown(input, { key: "Tab", shiftKey: true });

    expect(onQueryChange).not.toHaveBeenCalled();
  });

  it("does not accept when no completion is shown", () => {
    const { onQueryChange, input } = renderFilter("zzz");

    fireEvent.keyDown(input, { key: "Tab" });

    expect(onQueryChange).not.toHaveBeenCalled();
  });
});
