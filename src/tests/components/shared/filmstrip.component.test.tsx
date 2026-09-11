import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FilmstripViewer } from "@/components/shared/filmstrip.component";
import { useSettingsStore } from "@/store/settings.store";

vi.mock("@videojs/react/media/youtube-video", () => ({
  YouTubeVideo: ({ src }: { src: string }) => <div data-testid="youtube-player" data-src={src} />,
}));

afterEach(() => {
  cleanup();
});

const STILLS = ["https://img/s1.jpg", "https://img/s2.jpg", "https://img/s3.jpg"];

function renderViewer(props: Partial<Parameters<typeof FilmstripViewer>[0]> = {}) {
  return render(
    <FilmstripViewer
      stills={STILLS}
      trailerYoutubeId="tr1"
      trailerLabel="Trailer"
      {...props}
    />
  );
}

describe("FilmstripViewer", () => {
  it("renders the big scene, thumbnail strip, and highlights the active frame", async () => {
    useSettingsStore.setState({ language: "en" });
    renderViewer();
    const frame1 = await screen.findByRole("option", { name: /Frame 1|Кадр 1/ });
    expect(frame1.getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("option", { name: /Frame 3|Кадр 3/ }).getAttribute("aria-selected")).toBe(
      "false"
    );
    expect(screen.getByText("1/3")).toBeTruthy();
    expect(document.querySelector("img[src*='s1.jpg']")).not.toBeNull();
  });

  it("flips frames with the next/previous arrows and wraps around", async () => {
    useSettingsStore.setState({ language: "en" });
    const user = userEvent.setup();
    renderViewer();
    await user.click(await screen.findByRole("button", { name: "Next" }));
    expect(screen.getByText("2/3")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("3/3")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("1/3")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Previous" }));
    expect(screen.getByText("3/3")).toBeTruthy();
  });

  it("flips frames with arrow keys on the strip", async () => {
    useSettingsStore.setState({ language: "en" });
    const user = userEvent.setup();
    renderViewer();
    const strip = await screen.findByRole("listbox", { name: /Frames|Кадры/ });
    await user.click(strip);
    await user.keyboard("{ArrowRight}");
    expect(screen.getByText("2/3")).toBeTruthy();
    await user.keyboard("{ArrowLeft}");
    expect(screen.getByText("1/3")).toBeTruthy();
  });

  it("switches to the trailer tab and back to frames", async () => {
    useSettingsStore.setState({ language: "en" });
    const user = userEvent.setup();
    renderViewer();
    await user.click(await screen.findByRole("button", { name: "Trailer" }));
    expect(screen.getByTestId("youtube-player").dataset.src).toContain("tr1");
    const framesTab = screen.getByRole("button", { name: "Frames" });
    await user.click(framesTab);
    expect(framesTab.getAttribute("aria-pressed")).toBe("true");
    expect(screen.queryByTestId("youtube-player")).toBeNull();
    expect(screen.getByText("1/3")).toBeTruthy();
  });

  it("delegates trailer opens when onTrailerClick is provided", async () => {
    useSettingsStore.setState({ language: "en" });
    const user = userEvent.setup();
    const onTrailerClick = vi.fn();
    renderViewer({ onTrailerClick });
    await user.click(await screen.findByRole("button", { name: "Trailer" }));
    expect(onTrailerClick).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("youtube-player")).toBeNull();
  });

  it("starts with the trailer when requested", () => {
    useSettingsStore.setState({ language: "en" });
    renderViewer({ showTrailerInitially: true });
    expect(screen.getByTestId("youtube-player").dataset.src).toContain("tr1");
  });

  it("shows the empty state without stills", async () => {
    useSettingsStore.setState({ language: "en" });
    renderViewer({ stills: [], trailerYoutubeId: null });
    expect(await screen.findByText(/No results|Нет/i)).toBeTruthy();
    expect(screen.queryByRole("option")).toBeNull();
  });

  it("opens the trailer tab without the frames tab when no stills exist", async () => {
    useSettingsStore.setState({ language: "en" });
    const user = userEvent.setup();
    renderViewer({ stills: [], trailerYoutubeId: "tr1" });
    await user.click(await screen.findByRole("button", { name: "Trailer" }));
    expect(screen.getByTestId("youtube-player").dataset.src).toContain("tr1");
  });

  it("respects initialIndex", async () => {
    useSettingsStore.setState({ language: "en" });
    renderViewer({ initialIndex: 2 });
    expect(await screen.findByText("3/3")).toBeTruthy();
  });
});
