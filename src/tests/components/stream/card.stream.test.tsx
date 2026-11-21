import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { patchSettings } from "@/store/settings.store";
import type { StreamingAnime } from "@/types/player/stream";

const streamCover = vi.hoisted(() => vi.fn(() => null));

vi.mock("@/hooks/remoteImage.hook", () => ({
  useStreamCover: streamCover,
  resetRemoteImageCache: () => undefined,
}));

import { StreamCard } from "@/routes/components/stream/card.stream";

const ANIME: StreamingAnime = {
  id: "21371",
  title: "Sousou no Frieren",
  synonyms: [],
  genres: [],
  slugUrl: "21371--sousou-no-frieren-anime",
};

beforeEach(() => {
  patchSettings({ language: "ru" });
  streamCover.mockClear();
});

afterEach(cleanup);

describe("StreamCard memo", () => {
  it("skips a parent rerender with a new onOpen identity but follows tabIndex", () => {
    const view = render(<StreamCard anime={ANIME} onOpen={() => undefined} />);
    expect(streamCover).toHaveBeenCalledTimes(1);

    view.rerender(<StreamCard anime={ANIME} onOpen={() => undefined} />);
    expect(streamCover).toHaveBeenCalledTimes(1);

    view.rerender(<StreamCard anime={ANIME} onOpen={() => undefined} tabIndex={-1} />);
    expect(streamCover).toHaveBeenCalledTimes(2);
  });
});
