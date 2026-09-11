import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FILTER_KEYS } from "@/lib/search/intent.utils";
import { TagsReferenceModal } from "@/routes/components/collection/tags.collection";
import { useSettingsStore } from "@/store/settings.store";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("TagsReferenceModal", () => {
  it("renders nothing when closed", () => {
    render(<TagsReferenceModal open={false} onClose={() => {}} />);
    expect(screen.queryByText(/Search tags|Теги поиска/)).toBeNull();
  });

  it("lists every filter key with an example", () => {
    render(<TagsReferenceModal open onClose={() => {}} />);
    for (const key of Object.keys(FILTER_KEYS)) {
      expect(screen.getByText(key, { exact: true })).toBeTruthy();
    }
    expect(screen.getByText("year>=2000")).toBeTruthy();
    expect(screen.getByText("sort=rating:desc")).toBeTruthy();
    expect(screen.getByText("studio=mappa|ufotable")).toBeTruthy();
    expect(screen.getByText("genre=action|drama")).toBeTruthy();
    expect(screen.getByText("type=anime|movie")).toBeTruthy();
    expect(screen.getByText("status=watching|planned")).toBeTruthy();
    expect(screen.getByText("priority=high|normal")).toBeTruthy();
    expect(screen.getByText("provider=anilist|tmdb")).toBeTruthy();
    expect(screen.getByText("source=tmdb|custom")).toBeTruthy();
    expect(screen.getByText("tag=fantasy|romance")).toBeTruthy();
  });

  it("documents the ... range syntax", () => {
    render(<TagsReferenceModal open onClose={() => {}} />);
    expect(screen.getByText(/year=2000\.\.\.2010/)).toBeTruthy();
  });

  it("edits and resets approximate tolerances", async () => {
    const user = userEvent.setup();
    useSettingsStore.setState({
      tagTolerances: { year: 2, rating: 1, episodes: 2, progress: 5 },
    });
    render(<TagsReferenceModal open onClose={() => {}} />);
    const yearInput = screen.getByRole("spinbutton", { name: "year" }) as HTMLInputElement;
    expect(yearInput.value).toBe("2");
    await user.clear(yearInput);
    await user.type(yearInput, "7");
    expect(useSettingsStore.getState().tagTolerances.year).toBe(7);
    await user.click(screen.getByRole("button", { name: /Reset tolerances|Сбросить допуски/ }));
    expect(useSettingsStore.getState().tagTolerances.year).toBe(2);
  });
});
