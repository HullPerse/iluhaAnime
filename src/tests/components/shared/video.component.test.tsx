// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { YouTubeMedia } from "@videojs/media/dom/youtube";
import { forwardRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { VideoPlayer } from "@/components/shared/video.component";

const testEngine = {};
const openUrlSpy = vi.fn();

// The component syncs from media events ("playing"), so tests dispatch on the
// instance the player actually registered.
const mediaInstances: YouTubeMedia[] = [];

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: (...args: unknown[]) => openUrlSpy(...args),
}));

let testTracks: TextTrack[] = [];

// jsdom has no addTextTrack implementation, so the media reports a TextTrackList-like
// fake (EventTarget + index protocol), mirroring the library's own EMPTY_TEXT_TRACKS.
function fakeTrackList(): unknown {
  const target = new EventTarget();
  return new Proxy(target, {
    get(_t, prop) {
      if (prop === "length") return testTracks.length;
      if (typeof prop === "string" && /^\d+$/.test(prop)) return testTracks[Number(prop)];
      if (prop === Symbol.iterator) return testTracks[Symbol.iterator].bind(testTracks);
      const value = Reflect.get(target, prop);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

vi.mock("@videojs/react/media/youtube-video", async () => {
  const { useMediaInstance } = await import("@videojs/react");
  const { YouTubeMedia } = await import("@videojs/media/dom/youtube");
  class TestYouTubeMedia extends YouTubeMedia {
    constructor(...args: ConstructorParameters<typeof YouTubeMedia>) {
      super(...args);
      mediaInstances.push(this);
    }
    get volume() {
      return super.volume;
    }
    set volume(value: number) {
      super.volume = value;
      this.dispatchEvent(new Event("volumechange"));
    }
    // oxlint-disable-next-line class-literal-property-style
    get duration() {
      return 100;
    }
    get engine() {
      return testEngine as never;
    }
    override get textTracks() {
      return fakeTrackList() as never;
    }
  }

  return {
    YouTubeVideo: forwardRef(
      ({ src }: { src: string }, ref: React.Ref<HTMLDivElement>) => {
        useMediaInstance(TestYouTubeMedia);
        return <div ref={ref} data-testid="youtube-player" data-src={src} />;
      }
    ),
  };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
  openUrlSpy.mockReset();
  mediaInstances.length = 0;
  testTracks = [];
});

describe("VideoPlayer", () => {
  it("passes a nocookie source to the youtube tech", () => {
    render(<VideoPlayer youtubeId="abc123" title="Trailer" />);
    expect(screen.getByTestId("youtube-player").dataset.src).toContain(
      "https://www.youtube-nocookie.com/embed/abc123"
    );
  });


  it("renders a Win95 play control", () => {
    render(<VideoPlayer youtubeId="abc123" title="Trailer" />);
    const play = screen.getByRole("button", { name: "Play" });
    expect(play.className).toContain("windows95-active-border");
  });

  it("renders seek and volume sliders", () => {
    render(<VideoPlayer youtubeId="abc123" title="Trailer" />);
    expect(screen.getByRole("slider", { name: "Seek" })).toBeDefined();
    expect(screen.getByRole("slider", { name: "Volume" })).toBeDefined();
  });

  it("disposes without errors on unmount", () => {
    const view = render(<VideoPlayer youtubeId="abc123" title="Trailer" />);
    expect(() => view.unmount()).not.toThrow();
  });

  it("defaults the volume to 5%", async () => {
    render(<VideoPlayer youtubeId="abc123" title="Trailer" />);
    const slider = screen.getByRole("slider", { name: "Volume" });
    await waitFor(() => expect(slider.getAttribute("aria-valuenow")).toBe("5"));
  });

  it("shows the volume percent on hover", async () => {
    render(<VideoPlayer youtubeId="abc123" title="Trailer" />);
    const volume = screen.getByRole("slider", { name: "Volume" });
    await waitFor(() => expect(volume.getAttribute("aria-valuenow")).toBe("5"));
    expect(screen.queryByText("5%")).toBeNull();
    fireEvent.mouseEnter(volume);
    expect(screen.getByText("5%")).toBeDefined();
    fireEvent.mouseLeave(volume);
    expect(screen.queryByText("5%")).toBeNull();
  });

  it("changes volume with the wheel", async () => {
    render(<VideoPlayer youtubeId="abc123" title="Trailer" />);
    const volume = screen.getByRole("slider", { name: "Volume" });
    await waitFor(() => expect(volume.getAttribute("aria-valuenow")).toBe("5"));
    fireEvent.wheel(volume, { deltaY: -100 });
    await waitFor(() => expect(volume.getAttribute("aria-valuenow")).toBe("10"));
    fireEvent.wheel(volume, { deltaY: 100 });
    await waitFor(() => expect(volume.getAttribute("aria-valuenow")).toBe("5"));
  });

  it("requests fullscreen on the iframe", () => {
    const requestFullscreen = vi.fn();
    render(<VideoPlayer youtubeId="abc123" title="Trailer" />);
    const iframe = screen.getByTestId("youtube-player");
    Object.defineProperty(iframe, "requestFullscreen", {
      configurable: true,
      value: requestFullscreen,
    });
    fireEvent.click(screen.getByRole("button", { name: "Fullscreen" }));
    expect(requestFullscreen).toHaveBeenCalledOnce();
  });

  it("shows the hovered time on the timeline", async () => {
    render(<VideoPlayer youtubeId="abc123" title="Trailer" />);
    const seek = screen.getByRole("slider", { name: "Seek" });
    await waitFor(() => expect(seek.getAttribute("aria-valuemax")).toBe("100"));
    vi.spyOn(seek, "getBoundingClientRect").mockReturnValue({
      left: 0,
      width: 100,
      top: 0,
      right: 100,
      bottom: 0,
      height: 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);
    fireEvent.mouseMove(seek, { clientX: 50 });
    expect(screen.getByText("0:50")).toBeDefined();
    fireEvent.mouseLeave(seek);
    expect(screen.queryByText("0:50")).toBeNull();
  });

  it("renders a webm source through the native video element", () => {
    render(<VideoPlayer webmUrl="https://host/video.webm" title="OP" />);
    const video = document.querySelector("video[src]");
    expect(video?.getAttribute("src")).toBe("https://host/video.webm");
    expect(screen.queryByTestId("youtube-player")).toBeNull();
  });

  it("offers open in browser for youtube sources", async () => {
    const user = userEvent.setup();
    render(<VideoPlayer youtubeId="abc123" title="Trailer" />);
    await user.click(screen.getByRole("button", { name: /Открыть в браузере|Open in browser/ }));
    expect(openUrlSpy).toHaveBeenCalledWith("https://www.youtube.com/watch?v=abc123");
  });

  it("hides the captions select when the video has no tracks", () => {
    render(<VideoPlayer youtubeId="abc123" title="Trailer" />);
    expect(screen.queryByRole("combobox", { name: "Captions" })).toBeNull();
  });

  it("lists native tracks and toggles one showing", async () => {
    testTracks = [
      { kind: "subtitles", label: "English", language: "en", id: "1", mode: "disabled" } as TextTrack,
      { kind: "subtitles", label: "Russian", language: "ru", id: "2", mode: "disabled" } as TextTrack,
    ];
    const user = userEvent.setup();
    render(<VideoPlayer youtubeId="abc123" title="Trailer" />);
    const captions = await screen.findByRole("combobox", { name: "Captions" });
    expect(captions.textContent).toContain("CC off");
    await user.click(captions);
    await waitFor(() => expect(captions.getAttribute("aria-expanded")).toBe("true"));
    await user.click(screen.getByRole("option", { name: "English" }));
    await waitFor(() => expect(captions.textContent).toContain("English"));
    expect(testTracks[0].mode).toBe("showing");
    expect(testTracks[1].mode).toBe("disabled");
    await user.click(captions);
    await waitFor(() => expect(captions.getAttribute("aria-expanded")).toBe("true"));
    await user.click(screen.getByRole("option", { name: "CC off" }));
    await waitFor(() => expect(captions.textContent).toContain("CC off"));
    expect(testTracks[0].mode).toBe("disabled");
  });
});