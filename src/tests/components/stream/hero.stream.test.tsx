import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import StreamHero from "@/routes/components/stream/hero.stream";
import { patchSettings } from "@/store/settings.store";
import type { StreamingAnime } from "@/types/stream";

vi.mock("@/hooks/remoteImage.hook", () => ({
  useStreamCover: () => null,
  resetRemoteImageCache: () => undefined,
}));

const ANIME: StreamingAnime = {
  id: "21371",
  title: "Sousou no Frieren",
  synonyms: [],
  genres: [],
  anilistId: 154587,
  slugUrl: "21371--sousou-no-frieren-anime",
};

function renderHero(overrides: Partial<React.ComponentProps<typeof StreamHero>> = {}) {
  return render(
    <StreamHero
      anime={ANIME}
      episodeNumber={1}
      canPlay
      playing={false}
      canOpenAnilist
      onPlay={vi.fn()}
      onOpenAnilist={vi.fn()}
      {...overrides}
    />
  );
}

beforeEach(() => {
  patchSettings({ language: "en" });
});

afterEach(() => {
  cleanup();
});

describe("StreamHero", () => {
  it("opens the AniList details from the title header", () => {
    const onOpenAnilist = vi.fn();
    renderHero({ onOpenAnilist });

    fireEvent.click(screen.getByRole("button", { name: "AniList details" }));

    expect(onOpenAnilist).toHaveBeenCalledTimes(1);
  });

  it("hides the AniList button without a session", () => {
    renderHero({ canOpenAnilist: false });

    expect(screen.queryByRole("button", { name: "AniList details" })).toBeNull();
  });

  it("hides the AniList button when the source matched no title", () => {
    renderHero({ anime: { ...ANIME, anilistId: undefined } });

    expect(screen.queryByRole("button", { name: "AniList details" })).toBeNull();
  });
});
