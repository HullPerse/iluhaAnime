import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import FiltersModal, { defaultFilters } from "@/routes/components/anilist/filters.anilist";
import { useSettingsStore } from "@/store/settings.store";
import type { AniListFiltersModalProps } from "@/types/anilist";

function renderModal(overrides: Partial<AniListFiltersModalProps> = {}) {
  const onApply = vi.fn();
  const onReset = vi.fn();
  const onClose = vi.fn();
  const onRandom = vi.fn();
  const props: AniListFiltersModalProps = {
    open: true,
    filters: defaultFilters,
    onApply,
    onReset,
    onClose,
    onRandom,
    randomPending: false,
    ...overrides,
  };
  return { ...render(<FiltersModal {...props} />), onApply, onReset, onClose, onRandom };
}

beforeEach(() => {
  useSettingsStore.setState({ language: "en" });
});

afterEach(() => cleanup());

describe("FiltersModal random", () => {
  it("calls onRandom with the current filters and stays open", async () => {
    const user = userEvent.setup();
    const { onRandom, onClose } = renderModal();
    await user.click(screen.getByRole("button", { name: "Random" }));
    expect(onRandom).toHaveBeenCalledOnce();
    expect(onRandom).toHaveBeenCalledWith(defaultFilters);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("passes unsaved local edits instead of the stale prop", async () => {
    const user = userEvent.setup();
    const { onRandom } = renderModal();
    await user.click(screen.getByText("Include adult content (18+)"));
    await user.click(screen.getByRole("button", { name: "Random" }));
    expect(onRandom).toHaveBeenCalledOnce();
    expect(onRandom.mock.calls[0]?.[0]).toMatchObject({ adult: true });
  });

  it("disables the random button while a pick is pending", async () => {
    const user = userEvent.setup();
    const { onRandom } = renderModal({ randomPending: true });
    const button = screen.getByRole("button", { name: "Random" });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    await user.click(button);
    expect(onRandom).not.toHaveBeenCalled();
  });

  it("renders nothing when closed", () => {
    const { container } = renderModal({ open: false });
    expect(container.innerHTML).toBe("");
  });
});
