import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MediaLightbox } from "@/components/shared/lightbox/lightbox.media";

vi.mock("@videojs/react/media/youtube-video", () => ({
  YouTubeVideo: ({ src }: { src: string }) => <div data-testid="youtube-player" data-src={src} />,
}));

afterEach(() => {
  cleanup();
});

function renderLightbox(onTrailerClick?: () => void) {
  return render(
    <MediaLightbox
      title="Stills"
      stills={["https://img/s1.jpg"]}
      trailerYoutubeId="t1"
      trailerLabel="Trailer"
      initialIndex={0}
      onClose={() => {}}
      onTrailerClick={onTrailerClick}
    />
  );
}

describe("MediaLightbox trailer", () => {
  it("opens the trailer inside the lightbox without a delegate", async () => {
    const user = userEvent.setup();
    renderLightbox();
    expect(screen.queryByTestId("youtube-player")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Trailer" }));
    expect(screen.getByTestId("youtube-player").dataset.src).toContain("t1");
  });

  it("delegates to onTrailerClick instead of opening the trailer", async () => {
    const user = userEvent.setup();
    const onTrailerClick = vi.fn();
    renderLightbox(onTrailerClick);
    await user.click(screen.getByRole("button", { name: "Trailer" }));
    expect(onTrailerClick).toHaveBeenCalledTimes(1);
    expect(document.querySelector("iframe")).toBeNull();
  });
});
