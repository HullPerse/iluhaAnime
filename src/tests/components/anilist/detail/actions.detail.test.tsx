import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DetailHeaderActions } from "@/routes/components/anilist/detail/actions.detail";
import { CopyLinkButton } from "@/routes/components/anilist/detail/copyLinkButton.detail";
import { FavHeartButton } from "@/routes/components/anilist/detail/favHeartButton.detail";
import type { QuickAddMedia } from "@/types/collection";

const writeTextSpy = vi.fn();
const mockInvoke = vi.fn();

vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({
  writeText: (...args: unknown[]) => writeTextSpy(...args),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (cmd: string, args?: Record<string, unknown>) => mockInvoke(cmd, args),
  convertFileSrc: (path: string) => `http://asset.localhost/${encodeURIComponent(path)}`,
}));

afterEach(() => {
  cleanup();
  writeTextSpy.mockReset();
  mockInvoke.mockReset();
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

function renderActions(trailerId: string | null = null, onTrailer?: (id: string) => void) {
  mockInvoke.mockImplementation((cmd: string) => {
    if (cmd === "list_collection_items") return Promise.resolve([]);
    if (cmd === "list_custom_field_defs") return Promise.resolve([]);
    if (cmd === "list_collection_statuses") return Promise.resolve([]);
    return Promise.resolve(null);
  });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <DetailHeaderActions
        anime={ANIME}
        isFavorite={false}
        trailerId={trailerId}
        onTrailer={onTrailer}
      />
    </QueryClientProvider>
  );
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

  it("keeps the collection button visible when there is no trailer", async () => {
    renderActions(null);
    expect(await screen.findByRole("button", { name: /to collection|В коллекцию/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Трейлер|Trailer/ })).toBeNull();
  });

  it("shows both the trailer and collection buttons when a trailer exists", async () => {
    const onTrailer = vi.fn();
    const user = userEvent.setup();
    renderActions("yt1", onTrailer);
    expect(await screen.findByRole("button", { name: /to collection|В коллекцию/ })).toBeTruthy();
    await user.click(await screen.findByRole("button", { name: /Трейлер|Trailer/ }));
    expect(onTrailer).toHaveBeenCalledWith("yt1");
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
