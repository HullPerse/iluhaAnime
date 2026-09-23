import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AniListActionControls from "@/routes/components/anilist/detail/controls.detail";
import { useSettingsStore } from "@/store/settings.store";
import type { AniMedia } from "@/types/anilist";

const mockInvoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

const ANIME = { id: 21, episodes: 24, title: "One Piece" } as unknown as AniMedia;

const ENTRY = {
  progress: 5,
  score: 8,
  list_status: "CURRENT",
  notes: "peak fiction",
};

function notesInput(): HTMLInputElement {
  return screen.getByLabelText(/омментар|omment/) as HTMLInputElement;
}

beforeEach(() => {
  mockInvoke.mockReset();
  mockInvoke.mockResolvedValue(undefined);
  useSettingsStore.setState({ language: "en" });
});

afterEach(() => {
  cleanup();
});

describe("AniListActionControls notes", () => {
  it("prefills the comment from the list entry", () => {
    render(<AniListActionControls anime={ANIME} listEntry={ENTRY} />);
    expect(notesInput().value).toBe("peak fiction");
  });

  it("sends the trimmed comment on save", async () => {
    const user = userEvent.setup();
    render(<AniListActionControls anime={ANIME} listEntry={ENTRY} />);
    await user.clear(notesInput());
    await user.type(notesInput(), "  rewatched  ");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("save_anilist_entry", {
        mediaId: 21,
        status: "CURRENT",
        progress: 5,
        score: 8,
        notes: "rewatched",
      })
    );
  });

  it("sends null once the comment is cleared", async () => {
    const user = userEvent.setup();
    render(<AniListActionControls anime={ANIME} listEntry={ENTRY} />);
    await user.clear(notesInput());
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith(
        "save_anilist_entry",
        expect.objectContaining({ notes: null })
      )
    );
  });
});
