import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import AniListSearchToolbar from "@/routes/components/anilist/searchToolbar.anilist";
import type { SearchField } from "@/types/collection";

const FILTERS = {
  tags: [],
  genres: [],
  format: "",
  status: "",
  season: "",
  seasonYear: null,
  adult: false,
  sort: "search",
  source: "",
  country: "",
  year: [1900, 2026] as [number, number],
  episodes: [0, 200] as [number, number],
  score: [0, 100] as [number, number],
};

function makeField(overrides: Partial<SearchField> = {}): SearchField {
  return {
    suggestions: [],
    inlineCompletion: null,
    deferredQuery: "",
    history: [],
    removeQuery: vi.fn(),
    recordSuggestion: vi.fn(),
    recordSuggestionIgnored: vi.fn(),
    addQuery: vi.fn(),
    handleSubmit: vi.fn(),
    handleSelect: vi.fn(),
    handleAcceptCompletion: vi.fn(),
    handleDismissCompletion: vi.fn(),
    inputProps: {
      value: "frieren",
      completion: null,
      suggestions: [],
      history: [],
      onChange: vi.fn(),
      onAcceptCompletion: vi.fn(),
      onDismissCompletion: vi.fn(),
      onSelectSuggestion: vi.fn(),
      onRemoveHistory: vi.fn(),
      onKeyDown: vi.fn(),
    },
    ...overrides,
  };
}

function renderToolbar(field: SearchField, props = {}) {
  return render(
    <AniListSearchToolbar
      field={field}
      global={false}
      onGlobal={vi.fn()}
      onReset={vi.fn()}
      filters={FILTERS}
      onFiltersOpen={vi.fn()}
      loadingSearch={false}
      {...props}
    />
  );
}

afterEach(() => cleanup());

describe("AniListSearchToolbar on shared field", () => {
  it("shows the field query value", () => {
    renderToolbar(makeField());
    expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("frieren");
  });

  it("resets the global search when cleared", async () => {
    const user = userEvent.setup();
    const field = makeField();
    const onReset = vi.fn();
    renderToolbar(field, { global: true, onReset });

    await user.clear(screen.getByRole("textbox"));

    expect(field.inputProps.onChange).toHaveBeenCalled();
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it("keeps typing local when not in global search", async () => {
    const user = userEvent.setup();
    const field = makeField();
    const onReset = vi.fn();
    renderToolbar(field, { global: false, onReset });

    await user.clear(screen.getByRole("textbox"));

    expect(field.inputProps.onChange).toHaveBeenCalled();
    expect(onReset).not.toHaveBeenCalled();
  });

  it("submits through global search once without touching history", async () => {
    const user = userEvent.setup();
    const field = makeField({ inlineCompletion: "frieren: beyond" });
    const onGlobal = vi.fn();
    renderToolbar(field, { onGlobal });

    await user.click(screen.getByRole("textbox"));
    await user.keyboard("{Enter}");

    expect(field.recordSuggestionIgnored).toHaveBeenCalledWith("frieren: beyond");
    expect(onGlobal).toHaveBeenCalledTimes(1);
    expect(field.addQuery).not.toHaveBeenCalled();
  });
});
