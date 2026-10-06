import { create } from "zustand";
import { persist } from "zustand/middleware";

import { DEFAULT_VOLUME } from "@/config/player/video.config";
import type {
  MpvChapter,
  MpvTrack,
  PlaybackSnapshot,
  PlaybackStore,
  PlayerSettings,
  PlayerStore,
} from "@/types/videoPlayer";

export const DEFAULT_PLAYER_SETTINGS: PlayerSettings = {
  rotation: 0,
  flipH: false,
  flipV: false,
  zoom: 1,
  aspectRatio: "contain",
  brightness: 100,
  contrast: 100,
  saturation: 100,
  hue: 0,
  gamma: 1,
  blur: 0,
  sepia: 0,
  grayscale: 0,
  subFontSize: 18,
  subFontFamily: "Arial",
  subColor: "#ffffff",
  subBgOpacity: 0,
  subBgColor: "#000000",
  toneMap: "auto",
  targetPeak: 1000,
  hdrComputePeak: false,
  targetPrim: "auto",
  targetTrc: "auto",
  loudnorm: false,
};

const INITIAL_PLAYBACK = {
  ready: false,
  hasFile: false,
  timePos: 0,
  duration: 0,
  paused: true,
  eofReached: false,
  speed: 1,
  muted: false,
  playlistIndex: -1,
  playlistCount: 0,
  path: "",
  tracks: [] as MpvTrack[],
  chapters: [] as MpvChapter[],
  seekTarget: null as number | null,
  seekSettle: false,
};

const SEEK_TARGET_TOLERANCE = 0.4;

function nextSeekTarget(
  state: Pick<PlaybackStore, "seekTarget" | "seekSettle" | "path">,
  snapshot: PlaybackSnapshot
): number | null {
  if (state.seekTarget === null) return null;
  const fileChanged = snapshot.path !== state.path;
  const reached = Math.abs(snapshot.timePos - state.seekTarget) <= SEEK_TARGET_TOLERANCE;
  return state.seekSettle || fileChanged || reached ? null : state.seekTarget;
}

export const usePlayerStore = create<PlayerStore>()(
  persist(
    (set) => ({
      volume: DEFAULT_VOLUME,
      folderPaths: [],
      eofMode: "none",
      hwdec: "auto-safe",
      seekMode: "keyframes",
      autoHide: false,
      profile: "basic",
      settings: { ...DEFAULT_PLAYER_SETTINGS },

      setVolume: (volume) => set({ volume: Math.min(1, Math.max(0, volume)) }),
      setFolderPaths: (paths) => set({ folderPaths: paths }),
      setEofMode: (mode) => set({ eofMode: mode }),
      setHwdec: (mode) => set({ hwdec: mode }),
      setSeekMode: (mode) => set({ seekMode: mode }),
      setAutoHide: (autoHide) => set({ autoHide }),
      setProfile: (profile) => set({ profile }),
      patchSettings: (patch) => set((state) => ({ settings: { ...state.settings, ...patch } })),
    }),
    {
      name: "playerState",
      merge: (persisted, current) => {
        const stored = (persisted ?? {}) as Partial<PlayerStore>;
        return {
          ...current,
          ...stored,
          settings: { ...current.settings, ...stored.settings },
        };
      },
    }
  )
);

export const usePlaybackStore = create<PlaybackStore>()((set) => ({
  ...INITIAL_PLAYBACK,

  setSnapshot: (snapshot: PlaybackSnapshot) =>
    set((state) => {
      const seekTarget = nextSeekTarget(state, snapshot);
      return {
        ready: true,
        hasFile: snapshot.path !== "",
        timePos: snapshot.timePos,
        duration: snapshot.duration,
        paused: snapshot.pause,
        eofReached: snapshot.eofReached,
        speed: snapshot.speed,
        muted: snapshot.muted,
        playlistIndex: snapshot.playlistIndex,
        playlistCount: snapshot.playlistCount,
        path: snapshot.path,
        fpsRender: snapshot.fpsRender,
        fpsVideo: snapshot.fpsVideo,
        dropCount: snapshot.dropCount,
        cacheDuration: snapshot.cacheDuration,
        hwdecCurrent: snapshot.hwdecCurrent,
        videoWidth: snapshot.videoWidth,
        videoHeight: snapshot.videoHeight,
        seekTarget,
        seekSettle: seekTarget === null ? false : state.seekSettle,
      };
    }),

  setSeekTarget: (time: number) => set({ seekTarget: time, seekSettle: false }),
  settleSeek: () => set((state) => (state.seekTarget === null ? {} : { seekSettle: true })),
  setTracks: (tracks: MpvTrack[]) => set({ tracks }),
  setChapters: (chapters: MpvChapter[]) => set({ chapters }),
  reset: () => set({ ...INITIAL_PLAYBACK }),
}));
