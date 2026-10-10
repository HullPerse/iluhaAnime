import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { TorrentCoverState } from "@/hooks/search/cover.hook";
import CoverCorrectionModal from "@/routes/components/search/default/correction.search";
import { coverCorrectionsAtoms, removeCoverOverride } from "@/store/cover.store";

const mockInvoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
  convertFileSrc: (path: string) => `http://asset.localhost/${encodeURIComponent(path)}`,
}));

const KEY = "modal test show|0";

function coverState(): TorrentCoverState {
  return {
    status: "resolved",
    coverUrl: null,
    remoteUrl: null,
    anilistId: 20,
    candidates: [
      { id: 20, romaji: "NARUTO", format: "TV", seasonYear: 2002 },
      { id: 1735, romaji: "NARUTO: Shippuuden", format: "TV", seasonYear: 2007 },
    ],
    coverKey: KEY,
  };
}

afterEach(() => {
  cleanup();
  removeCoverOverride(KEY);
});

beforeEach(() => {
  mockInvoke.mockReset();
  mockInvoke.mockImplementation(async () => null);
});

describe("CoverCorrectionModal", () => {
  it("applies the picked candidate and rejects the previous one", async () => {
    const user = userEvent.setup();
    render(
      <CoverCorrectionModal torrentTitle="Modal Test Show" cover={coverState()} onClose={vi.fn()} />
    );
    await user.click(screen.getByText("NARUTO: Shippuuden"));
    await user.click(screen.getByRole("button", { name: "Apply" }));
    await waitFor(() => {
      expect(coverCorrectionsAtoms.overrides.get()[KEY]?.id).toBe(1735);
    });
    expect(coverCorrectionsAtoms.rejections.get()[KEY]).toEqual([20]);
    expect(coverCorrectionsAtoms.aliases.get()[KEY]).toBe("NARUTO: Shippuuden");
  });

  it("finds other anime through manual search", async () => {
    const user = userEvent.setup();
    mockInvoke.mockImplementation(async (command: unknown) => {
      if (command === "search_anilist") {
        return [
          {
            id: 269,
            title: "BLEACH",
            titles: ["BLEACH"],
            title_romaji: "BLEACH",
            format: "TV",
            season_year: 2004,
            cover_url: null,
          },
        ];
      }
      return null;
    });
    render(
      <CoverCorrectionModal torrentTitle="Modal Test Show" cover={coverState()} onClose={vi.fn()} />
    );
    await user.type(screen.getByPlaceholderText("Find another anime..."), "bleach");
    await waitFor(() => expect(screen.getByText("BLEACH")).toBeDefined());
  });

  it("clears a manual binding back to auto", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <CoverCorrectionModal
        torrentTitle="Modal Test Show"
        cover={{ ...coverState(), status: "override" }}
        onClose={onClose}
      />
    );
    await user.click(screen.getByRole("button", { name: "Use auto cover" }));
    expect(coverCorrectionsAtoms.overrides.get()[KEY]).toBeUndefined();
    expect(onClose).toHaveBeenCalled();
  });
});
