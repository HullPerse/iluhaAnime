import { Profiler } from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import Timeline from "@/routes/components/player/media/timeline.player";
import {
  playbackAtEnd,
  playbackAtStart,
  playbackAtoms,
  resetPlayback,
  setPlaybackSnapshot,
} from "@/store/player.store";
import { patchSettings } from "@/store/settings.store";
import type { PlaybackSnapshot } from "@/types/player/videoPlayer";

const SNAPSHOT: PlaybackSnapshot = {
  timePos: 0,
  duration: 1400,
  pause: false,
  eofReached: false,
  speed: 1,
  volume: 0.8,
  muted: false,
  playlistIndex: 0,
  playlistCount: 1,
  path: "/media/ep01.mkv",
};

beforeEach(() => {
  patchSettings({ language: "en" });
  resetPlayback();
});

afterEach(() => {
  cleanup();
});

describe("player re-render profile", () => {
  it("measures atom notifications and timeline commits for 60 playback ticks", async () => {
    const ticks = 60;
    const notifications: Record<string, number> = {};
    const unsubs = Object.entries(playbackAtoms).map(([name, atom]) =>
      atom.subscribe(() => {
        notifications[name] = (notifications[name] ?? 0) + 1;
      })
    );
    // Seed the derived cells so their first evaluation is not counted as a flip.
    playbackAtStart.get();
    playbackAtEnd.get();
    const boundaries = { atStart: 0, atEnd: 0 };
    const unsubStart = playbackAtStart.subscribe(() => {
      boundaries.atStart += 1;
    });
    const unsubEnd = playbackAtEnd.subscribe(() => {
      boundaries.atEnd += 1;
    });

    let commits = 0;
    const { unmount } = render(
      <Profiler
        id="timeline"
        onRender={(id) => {
          if (id === "timeline") commits += 1;
        }}
      >
        <Timeline
          duration={1400}
          chapters={[]}
          seekTarget={null}
          onScrub={() => undefined}
          onCommitSeek={() => undefined}
        />
      </Profiler>
    );

    for (let tick = 0; tick < ticks; tick += 1) {
      setPlaybackSnapshot({ ...SNAPSHOT, timePos: (tick + 1) * 0.1 });
      // A real tick arrives 100 ms apart; yielding lets React flush each one.
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    unmount();
    for (const unsubscribe of unsubs) unsubscribe();
    unsubStart();
    unsubEnd();

    expect(notifications.timePos).toBe(ticks);
    // The first snapshot changes the duration once; later ticks must not.
    expect(notifications.duration ?? 0).toBe(1);
    // A boundary flag flips once when playback leaves 0, not on every tick.
    expect(boundaries.atStart).toBe(1);
    expect(boundaries.atEnd).toBe(0);
    expect(commits).toBeGreaterThan(0);
  });
});
