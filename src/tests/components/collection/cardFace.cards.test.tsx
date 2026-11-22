import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import CardFace from "@/routes/components/collection/cardFace.cards";
import { resetCardsStore } from "@/store/cards.store";
import { settingsAtoms } from "@/store/settings.store";
import type { CardFaceItem } from "@/types/ui/collection";

vi.mock("@/hooks/remoteImage.hook", () => ({
  useRemoteImageStatus: (url: string | null | undefined) => ({ src: url ?? null, failed: false }),
  resetRemoteImageCache: () => undefined,
}));

vi.mock("@/components/shared/dither.component", () => ({
  default: ({ src, imageFit }: { src: string; imageFit: string }) => (
    <canvas data-dither-src={src} data-image-fit={imageFit} />
  ),
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

afterEach(() => {
  cleanup();
  resetCardsStore();
  settingsAtoms.cardImageFill.set(false);
});

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

  it("fills character art when the appearance checkbox is enabled", () => {
    const character: CardFaceItem = { ...ANIME, kind: "character", entityId: 7 };
    const { container, rerender } = render(<CardFace card={character} />);
    expect(container.querySelector(".cards-art img")?.className).toContain("object-contain");
    settingsAtoms.cardImageFill.set(true);
    rerender(<CardFace card={character} />);
    expect(container.querySelector(".cards-art img")?.className).toContain("object-cover");
    rerender(<CardFace card={{ ...character, variant: "cursed" }} />);
    expect(container.querySelector<HTMLCanvasElement>(".cards-art canvas")?.dataset.imageFit).toBe(
      "cover"
    );
  });
});
