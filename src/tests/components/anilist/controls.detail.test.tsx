import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AniListActionControls from "@/routes/components/anilist/detail/controls.detail";
import { useSettingsStore } from "@/store/settings.store";
import type { AniMedia } from "@/types/anilist";

const mockInvoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
  convertFileSrc: (path: string) => `http://asset.localhost/${encodeURIComponent(path)}`,
}));

const MEDIA_ID = 501;

function makeAnime(): AniMedia {
  return {
    id: MEDIA_ID,
    title: "Frieren",
    titles: ["Frieren"],
    episodes: 28,
    duration: 24,
    format: "TV",
    status: "FINISHED",
    score: null,
    genres: [],
    tags: [],
    description: null,
    cover_url: null,
    season: null,
    season_year: 2023,
    studios: [],
    next_episode: null,
    next_airing_at: null,
    start_date: null,
    end_date: null,
    popularity: null,
    favourites: null,
    rankings: [],
    relations: [],
  };
}

function renderControls(scoreFormat: string, score: number | null = null) {
  return render(
    <AniListActionControls
      anime={makeAnime()}
      listEntry={{
        progress: 5,
        score,
        list_status: "COMPLETED",
        notes: null,
      }}
      scoreFormat={scoreFormat as "POINT_10"}
    />
  );
}

function saveButton() {
  return screen.getByRole("button", { name: "Save" }) as HTMLButtonElement;
}

afterEach(() => cleanup());

beforeEach(() => {
  useSettingsStore.setState({ language: "en" });
  mockInvoke.mockReset();
  mockInvoke.mockResolvedValue(null);
});

describe("AniListActionControls score formats", () => {
  it("offers a 0-100 field on the hundred point format", () => {
    renderControls("POINT_100");
    const input = screen.getByLabelText("Score:") as HTMLInputElement;
    expect(input.type).toBe("number");
    expect(input.max).toBe("100");
    expect(screen.getByText("/100")).toBeTruthy();
  });

  it("names the expected range for a hundred point score that is out of bounds", async () => {
    const user = userEvent.setup();
    renderControls("POINT_100");
    const input = screen.getByLabelText("Score:");
    await user.clear(input);
    await user.type(input, "101");
    expect(await screen.findByText("Whole number from 0 to 100")).toBeTruthy();
    await user.click(saveButton());
    expect(mockInvoke).not.toHaveBeenCalledWith("save_anilist_entry", expect.anything());
  });

  it("blocks a fractional score on a whole number format", async () => {
    const user = userEvent.setup();
    renderControls("POINT_100");
    const input = screen.getByLabelText("Score:");
    await user.clear(input);
    await user.type(input, "5.5");
    expect(await screen.findByText("Whole number from 0 to 100")).toBeTruthy();
    await user.click(saveButton());
    expect(mockInvoke).not.toHaveBeenCalledWith("save_anilist_entry", expect.anything());
  });

  it("clears the score by emptying the field", async () => {
    const user = userEvent.setup();
    renderControls("POINT_100", 85);
    await user.clear(screen.getByLabelText("Score:"));
    expect(screen.queryByText(/Whole number/u)).toBeNull();
    await user.click(saveButton());
    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith(
        "save_anilist_entry",
        expect.objectContaining({ mediaId: MEDIA_ID, score: null })
      )
    );
  });

  it("picks a whole ten point score from a list instead of typing", () => {
    renderControls("POINT_10", 8);
    expect(screen.queryByLabelText("Score:")).toBeNull();
    expect(screen.getByText("8")).toBeTruthy();
  });

  it("keeps the entered decimal and saves it on a decimal format", async () => {
    const user = userEvent.setup();
    renderControls("POINT_10_DECIMAL", 8);
    const input = screen.getByLabelText("Score:") as HTMLInputElement;
    expect(input.step).toBe("0.1");
    await user.clear(input);
    await user.type(input, "5.5");
    expect(screen.queryByText(/0 to 10/u)).toBeNull();
    await user.click(saveButton());
    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith(
        "save_anilist_entry",
        expect.objectContaining({ mediaId: MEDIA_ID, score: 5.5 })
      )
    );
  });

  it("shows the smiley option instead of a field on the three point format", () => {
    renderControls("POINT_3", 3);
    expect(screen.queryByLabelText("Score:")).toBeNull();
    expect(screen.getByText(":)")).toBeTruthy();
  });

  it("saves the score of the hundred point format as entered", async () => {
    const user = userEvent.setup();
    renderControls("POINT_100", 85);
    expect((screen.getByLabelText("Score:") as HTMLInputElement).value).toBe("85");
    await user.click(saveButton());
    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith(
        "save_anilist_entry",
        expect.objectContaining({ mediaId: MEDIA_ID, score: 85 })
      )
    );
  });
});
