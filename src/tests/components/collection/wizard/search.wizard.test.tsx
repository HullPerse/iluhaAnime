import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { WizardSourceSearch } from "@/routes/components/collection/wizard/search.wizard";
import { useSettingsStore } from "@/store/settings.store";
import type { WizardSearchResult } from "@/types/collection";

const RESULTS: WizardSearchResult[] = [
  { id: 1, title: "Frieren", cover_url: null, year: 2023 },
  { id: 2, title: "Dune", cover_url: null, year: 2021 },
];

function renderSearch() {
  const onPickResult = vi.fn();
  render(
    <WizardSourceSearch
      source="anilist"
      search="fre"
      setSearch={vi.fn()}
      onSearch={vi.fn()}
      loading={false}
      hasTmdbKey={false}
      searchResults={RESULTS}
      onPickResult={onPickResult}
    />
  );
  return { onPickResult };
}

afterEach(() => cleanup());

describe("WizardSourceSearch results", () => {
  it("shows results without focus and keeps them after blur and pick", () => {
    useSettingsStore.setState({ language: "en" });
    const { onPickResult } = renderSearch();
    expect(screen.getByRole("button", { name: /Frieren/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Dune/ })).toBeTruthy();

    fireEvent.blur(screen.getByRole("textbox"));
    expect(screen.getByRole("button", { name: /Frieren/ })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Frieren/ }));
    expect(onPickResult).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: /Dune/ })).toBeTruthy();
  });
});
