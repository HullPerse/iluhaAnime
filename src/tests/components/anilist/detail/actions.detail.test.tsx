import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CopyLinkButton,
  DetailHeaderActions,
  FavHeartButton,
} from "@/routes/components/anilist/detail/actions.detail";
import type { QuickAddMedia } from "@/types/collection";

const writeTextSpy = vi.fn();

vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({
  writeText: (...args: unknown[]) => writeTextSpy(...args),
}));

afterEach(() => {
  cleanup();
  writeTextSpy.mockReset();
});

const ANIME: QuickAddMedia = {
  cover_url: null,
  description: null,
  duration: 24,
  episodes: 24,
  genres: [],
  id: 21,
  id_mal: null,
  score: 84,
  season_year: null,
  start_date: null,
  format: null,
  studios: [],
  tags: [],
  title: "One Piece",
  titles: [],
  trailer_youtube_id: null,
};

function renderActions() {
  return render(<DetailHeaderActions anime={ANIME} isFavorite={false} trailerId={null} />);
}

function renderCopyButton() {
  return render(<CopyLinkButton animeId={21} />);
}

describe("CopyLinkButton", () => {
  it("renders a copy-link button", () => {
    renderCopyButton();
    expect(
      screen.getByRole("button", { name: /Copy direct link|Скопировать прямую ссылку/ })
    ).toBeTruthy();
  });

  it("copies the exact direct link for the shown anime", async () => {
    const user = userEvent.setup();
    renderCopyButton();
    await user.click(
      screen.getByRole("button", { name: /Copy direct link|Скопировать прямую ссылку/ })
    );
    expect(writeTextSpy).toHaveBeenCalledWith("iluhaanime://anime/anilist/21");
  });
});

describe("DetailHeaderActions without copy", () => {
  it("renders no copy-link button in the body", () => {
    renderActions();
    expect(
      screen.queryByRole("button", { name: /Copy direct link|Скопировать прямую ссылку/ })
    ).toBeNull();
  });
});

describe("FavHeartButton", () => {
  it("toggles on click", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(<FavHeartButton isFavorite={false} loading={false} onToggle={onToggle} />);
    await user.click(
      screen.getByRole("button", { name: /Добавить в избранное|Add to favourites/ })
    );
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("is absent from the body actions", () => {
    renderActions();
    expect(
      screen.queryByRole("button", { name: /Добавить в избранное|Add to favourites/ })
    ).toBeNull();
  });
});
