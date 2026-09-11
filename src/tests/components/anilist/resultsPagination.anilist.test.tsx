import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import AniListResultsPagination from "@/routes/components/anilist/resultsPagination.anilist";
import { useSettingsStore } from "@/store/settings.store";

function renderPagination() {
  render(
    <AniListResultsPagination
      global={false}
      isLocal={false}
      hasUser
      searchResultsCount={0}
      searchTag={null}
      searchMode={null}
      currentList="Completed"
      filteredCount={0}
      activeCount={774}
      total={774}
      page={1}
      lastPage={20}
      from={1}
      to={40}
      onPageChange={() => {}}
      scrollRef={{ current: null }}
    />
  );
}

beforeEach(() => {
  useSettingsStore.setState({ language: "ru" });
});

afterEach(() => {
  cleanup();
});

describe("AniListResultsPagination", () => {
  it("localizes the list name in the status text", () => {
    renderPagination();
    expect(screen.getByText("Просмотрено: 774")).toBeTruthy();
  });
});
