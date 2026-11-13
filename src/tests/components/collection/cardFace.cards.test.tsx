import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import CardFace from "@/routes/components/collection/cardFace.cards";
import type { CardFaceItem } from "@/routes/components/collection/cardFace.cards";

vi.mock("@/hooks/remoteImage.hook", () => ({
  useRemoteImageStatus: (url: string | null | undefined) => ({ src: url ?? null, failed: false }),
  resetRemoteImageCache: () => undefined,
}));

const STUDIO: CardFaceItem = {
  kind: "studio",
  entityId: 2,
  title: "Kyoto Animation",
  imageUrl: null,
  collage: ["https://img/1.jpg", "https://img/2.jpg", "https://img/3.jpg"],
  rarity: "legendary",
  variant: "holo",
  value: 34,
};

const ANIME: CardFaceItem = {
  kind: "anime",
  entityId: 16498,
  title: "Shingeki no Kyojin",
  imageUrl: "https://img/aot.jpg",
  collage: [],
  rarity: "rare",
  variant: "foil",
  value: 8,
};

const MANGA: CardFaceItem = {
  ...ANIME,
  kind: "manga",
  entityId: 30013,
  title: "Berserk",
  imageUrl: "https://img/berserk.jpg",
};

afterEach(cleanup);

describe("CardFace", () => {
  it("renders the studio collage with a monogram for the missing cell", () => {
    const { container } = render(<CardFace card={STUDIO} />);

    expect(screen.getByText("Kyoto Animation")).toBeTruthy();
    expect(container.querySelectorAll(".cards-studio-cell img")).toHaveLength(3);
    expect(container.querySelectorAll(".cards-studio-letter")).toHaveLength(1);
    const money = container.querySelector('img[src="/money.png"]') as HTMLImageElement;
    expect(money).not.toBeNull();
    fireEvent.error(money);
    expect(money.style.display).toBe("none");
    expect(screen.getByText("34")).toBeTruthy();
    expect(screen.queryByText(/favourites/iu)).toBeNull();
    expect(screen.queryByText(/score/iu)).toBeNull();
  });

  it("uses cover art for anime and manga and the holo overlay only above junk", () => {
    const { container } = render(<CardFace card={ANIME} />);
    const image = container.querySelector("img[src='https://img/aot.jpg']");
    expect(image?.className).toContain("object-cover");
    expect(container.querySelector(".cards-inner")?.className).toContain("cards-variant-foil");

    const manga = render(<CardFace card={MANGA} />);
    expect(manga.container.querySelector("img[src='https://img/berserk.jpg']")?.className).toContain(
      "object-cover"
    );

    const junkHolo = render(
      <CardFace card={{ ...ANIME, rarity: "junk", variant: "holo" }} />
    );
    expect(junkHolo.container.querySelector(".cards-inner")?.className).not.toContain(
      "cards-variant-holo"
    );
  });

  it("shows five rarity pips with only the tier count lit", () => {
    const { container } = render(<CardFace card={ANIME} />);
    const pips = container.querySelectorAll(".cards-pip");
    expect(pips).toHaveLength(5);
    expect(container.querySelectorAll('.cards-pip[data-on="true"]')).toHaveLength(3);
  });
});
