import { describe, expect, it } from "vitest";

import {
  DEFAULT_PLAYER_SETTINGS,
  createPlaybackSignalStore,
  createPlayerSignalStore,
  type PlaybackSignalStore,
} from "@/store/player.store";
import type { PlaybackSnapshot } from "@/types/videoPlayer";

function memoryStorage(backing = new Map<string, string>()): Storage {
  return {
    getItem: (key: string) => backing.get(key) ?? null,
    setItem: (key: string, value: string) => {
      backing.set(key, value);
    },
    removeItem: (key: string) => {
      backing.delete(key);
    },
    clear: () => backing.clear(),
    key: (index: number) => [...backing.keys()][index] ?? null,
    get length() {
      return backing.size;
    },
  };
}

const SNAPSHOT: PlaybackSnapshot = {
  path: "/media/ep01.mkv",
  timePos: 12.5,
  duration: 1400,
  pause: false,
  volume: 1,
  eofReached: false,
  speed: 1,
  muted: false,
  playlistIndex: 0,
  playlistCount: 3,
  fpsRender: 60,
  fpsVideo: 24,
  dropCount: 0,
  cacheDuration: 4,
  hwdecCurrent: "nvdec",
  videoWidth: 1920,
  videoHeight: 1080,
};

describe("player settings atoms", () => {
  it("starts from defaults", () => {
    const store = createPlayerSignalStore({ getStorage: () => memoryStorage() });
    expect(store.atoms.volume.get()).toBe(0.2);
    expect(store.atoms.settings.get()).toEqual(DEFAULT_PLAYER_SETTINGS);
  });

  it("clamps volume into range", () => {
    const store = createPlayerSignalStore({ getStorage: () => memoryStorage() });
    store.setVolume(4);
    expect(store.atoms.volume.get()).toBe(1);
    store.setVolume(-2);
    expect(store.atoms.volume.get()).toBe(0);
  });

  it("merges settings patches", () => {
    const store = createPlayerSignalStore({ getStorage: () => memoryStorage() });
    store.patchPlayerSettings({ brightness: 120 });
    expect(store.atoms.settings.get().brightness).toBe(120);
    expect(store.atoms.settings.get().contrast).toBe(100);
  });

  it("adopts the legacy playerState envelope once", () => {
    const backing = new Map<string, string>([
      ["playerState", JSON.stringify({ state: { volume: 0.5 }, version: 0 })],
    ]);
    const store = createPlayerSignalStore({ getStorage: () => memoryStorage(backing) });
    expect(store.atoms.volume.get()).toBe(0.5);
    expect(backing.has("iluha.v1.player")).toBe(true);
    expect(backing.has("playerState")).toBe(false);
  });
});

describe("playback atoms", () => {
  function setup(): PlaybackSignalStore {
    return createPlaybackSignalStore();
  }

  it("maps snapshots onto atoms including the pause flag", () => {
    const playback = setup();
    playback.setSnapshot(SNAPSHOT);
    expect(playback.atoms.timePos.get()).toBe(12.5);
    expect(playback.atoms.paused.get()).toBe(false);
    expect(playback.atoms.hasFile.get()).toBe(true);
    expect(playback.atoms.playlistCount.get()).toBe(3);
  });

  it("clears the seek target after consecutive in-tolerance snapshots", () => {
    const playback = setup();
    playback.setSnapshot(SNAPSHOT);
    playback.setSeekTarget(100);
    expect(playback.atoms.seekTarget.get()).toBe(100);
    playback.setSnapshot({ ...SNAPSHOT, timePos: 100.2 });
    expect(playback.atoms.seekTarget.get()).toBe(100);
    playback.setSnapshot({ ...SNAPSHOT, timePos: 100.1 });
    expect(playback.atoms.seekTarget.get()).toBeNull();
  });

  it("resets confirmations when the position leaves tolerance", () => {
    const playback = setup();
    playback.setSnapshot(SNAPSHOT);
    playback.setSeekTarget(100);
    playback.setSnapshot({ ...SNAPSHOT, timePos: 100.2 });
    expect(playback.atoms.seekTarget.get()).toBe(100);
    playback.setSnapshot({ ...SNAPSHOT, timePos: 50 });
    playback.setSnapshot({ ...SNAPSHOT, timePos: 100.2 });
    expect(playback.atoms.seekTarget.get()).toBe(100);
  });

  it("keeps an unreached seek target across snapshots", () => {
    const playback = setup();
    playback.setSnapshot(SNAPSHOT);
    playback.setSeekTarget(100);
    playback.setSnapshot({ ...SNAPSHOT, timePos: 10 });
    expect(playback.atoms.seekTarget.get()).toBe(100);
  });

  it("settles seeks only while a target exists", () => {
    const playback = setup();
    playback.settleSeek();
    expect(playback.atoms.seekSettle.get()).toBe(false);
    playback.setSeekTarget(0.2);
    playback.settleSeek();
    expect(playback.atoms.seekSettle.get()).toBe(true);
  });

  it("ignores a settle against a stale position", () => {
    const playback = setup();
    playback.setSnapshot({ ...SNAPSHOT, timePos: 10 });
    playback.setSeekTarget(100);
    // A playback-restart from an older seek arrives while timePos still
    // shows the pre-seek position: the fresh target must survive it.
    playback.settleSeek();
    expect(playback.atoms.seekSettle.get()).toBe(false);
    expect(playback.atoms.seekTarget.get()).toBe(100);
  });

  it("settles once the position has caught up with the target", () => {
    const playback = setup();
    playback.setSnapshot({ ...SNAPSHOT, timePos: 10 });
    playback.setSeekTarget(100);
    playback.setSnapshot({ ...SNAPSHOT, timePos: 100.1 });
    expect(playback.atoms.seekTarget.get()).toBe(100);
    playback.settleSeek();
    expect(playback.atoms.seekSettle.get()).toBe(true);
    playback.setSnapshot({ ...SNAPSHOT, timePos: 100.1 });
    expect(playback.atoms.seekTarget.get()).toBeNull();
  });

  it("marks the selected track per kind", () => {
    const playback = setup();
    playback.setTracks([
      { id: 1, type: "audio", selected: false },
      { id: 2, type: "audio", selected: false },
    ]);
    playback.markTrackSelected("audio", 2);
    expect(playback.atoms.tracks.get().map((track) => track.selected)).toEqual([false, true]);
  });

  it("resets to the initial playback state", () => {
    const playback = setup();
    playback.setSnapshot(SNAPSHOT);
    playback.resetPlayback();
    expect(playback.atoms.timePos.get()).toBe(0);
    expect(playback.atoms.path.get()).toBe("");
    expect(playback.atoms.paused.get()).toBe(true);
  });
});
