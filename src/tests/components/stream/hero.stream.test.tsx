import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import StreamHero from "@/routes/components/stream/hero.stream";
import { patchSettings } from "@/store/settings.store";
import type { StreamingAnime } from "@/types/player/stream";

vi.mock("@/hooks/remoteImage.hook", () => ({
  useStreamCover: () => null,
  resetRemoteImageCache: () => undefined,
}));

const ANIME: StreamingAnime = {
  id: "21371",
  title: "Sousou no Frieren",
  synonyms: ["Frieren: Beyond Journey's End"],
  genres: ["Adventure"],
  description: "An elf and a party of heroes.",
  year: 2023,
  status: "Завершён",
  episodeCount: 28,
  anilistId: 154587,
  slugUrl: "21371--sousou-no-frieren-anime",
};

const renderHero = (anime: StreamingAnime = ANIME) => {
  return render(<StreamHero anime={anime} />);
};

beforeEach(() => {
  patchSettings({ language: "en" });
});

afterEach(() => {
  cleanup();
});

describe("StreamHero", () => {
  it("names the title, its synonyms and its badges", () => {
    renderHero();

    expect(screen.getByText("Sousou no Frieren")).toBeDefined();
    expect(screen.getByText("Frieren: Beyond Journey's End")).toBeDefined();
    expect(screen.getByText("2023")).toBeDefined();
    expect(screen.getByText("28 episodes")).toBeDefined();
    expect(screen.getByText("Adventure")).toBeDefined();
  });

  it("carries no action of its own: the season and the modal header own them", () => {
    renderHero();

    expect(screen.queryByRole("button")).toBeNull();
  });

  it("hides the synonym line when the source sends none", () => {
    renderHero({ ...ANIME, synonyms: [] });

    expect(screen.queryByText("Frieren: Beyond Journey's End")).toBeNull();
  });
});
