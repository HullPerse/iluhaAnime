import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_FILTERS } from "@/config/collection/filters.config";
import FilterCollection from "@/routes/components/collection/filter.collection";
import { useSettingsStore } from "@/store/settings.store";
import type { CollectionFilters } from "@/types/collection";

const DEFAULT_MODAL_FILTERS: CollectionFilters = {
  ...DEFAULT_FILTERS,
  mediaTypes: [],
  genres: [],
};

function renderModal(filters: CollectionFilters = DEFAULT_MODAL_FILTERS) {
  const onApply = vi.fn();
  const onClose = vi.fn();
  render(<FilterCollection open filters={filters} onApply={onApply} onClose={onClose} />);
  return { onApply, onClose };
}

async function clickOption(text: string, role: string) {
  const user = userEvent.setup();
  const label = screen.getByText(text).closest("label");
  if (!label) throw new Error(`No label found for option "${text}"`);
  await user.click(within(label).getByRole(role));
  return user;
}

afterEach(() => cleanup());

beforeEach(() => {
  useSettingsStore.setState({ language: "en" });
});

describe("FilterCollection modal", () => {
  it("renders nothing when closed", () => {
    render(
      <FilterCollection
        open={false}
        filters={{ ...DEFAULT_FILTERS, mediaTypes: [], genres: [] }}
        onApply={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.queryByText("Filters")).toBeNull();
  });

  it("keeps edits local until Apply", async () => {
    const { onApply, onClose } = renderModal();
    await clickOption("Anime", "checkbox");
    expect(onApply).not.toHaveBeenCalled();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Apply" }));
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply.mock.calls[0]![0]).toMatchObject({ mediaTypes: ["anime"] });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("selects a radio by clicking its label text", async () => {
    const { onApply } = renderModal();
    const user = userEvent.setup();
    await user.click(screen.getByText("TMDB"));
    await user.click(screen.getByRole("button", { name: "Apply" }));
    expect(onApply.mock.calls[0]![0]).toMatchObject({ provider: "tmdb" });
  });

  it("resets the draft without applying on Reset", async () => {
    const { onApply, onClose } = renderModal({
      ...DEFAULT_FILTERS,
      provider: "tmdb",
      mediaTypes: [],
      genres: ["Action"],
    });
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Reset filters" }));
    expect(onApply).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Apply" }));
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply.mock.calls[0]![0]).toMatchObject({ provider: "any", genres: [] });
  });

  it("closes without applying on Cancel", async () => {
    const { onApply, onClose } = renderModal();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onApply).not.toHaveBeenCalled();
  });

  it("removes genre chips from the draft", async () => {
    const { onApply } = renderModal({
      ...DEFAULT_FILTERS,
      mediaTypes: [],
      genres: ["Action"],
    });
    const user = userEvent.setup();
    await user.click(screen.getByText("Action"));
    await user.click(screen.getByRole("button", { name: "Apply" }));
    expect(onApply.mock.calls[0]![0]).toMatchObject({ genres: [] });
  });
});
