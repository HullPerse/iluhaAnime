import type { TranslationKey } from "@/types/core/i18n";
import type { CrtCurvature, PlayerCabinetId, PlayerModeId } from "@/types/player/videoPlayer";
import type { PlayerModeDef } from "@/types/core/modes";

export const PLAYER_MODES: Record<PlayerModeId, PlayerModeDef> = {
  normal: {
    id: "normal",
    labelKey: "player.media.settings.mode.normal",
    shader: null,
    params: {},
    curvatureEditable: false,
  },
  tv: {
    id: "tv",
    labelKey: "player.media.settings.mode.tv",
    shader: "crt-tv",
    params: { curvature: 0.04, scanline: 0.6, mask: 0.35, mono: 0, tint: 0 },
    curvatureEditable: true,
  },
  monitor: {
    id: "monitor",
    labelKey: "player.media.settings.mode.monitor",
    shader: "crt-tv",
    params: { curvature: 0, scanline: 0.3, mask: 0.5, mono: 0, tint: 0 },
    curvatureEditable: false,
  },
  mono: {
    id: "mono",
    labelKey: "player.media.settings.mode.mono",
    shader: "crt-tv",
    params: { curvature: 0.04, scanline: 0.7, mask: 0.3, mono: 1, tint: 0.25 },
    curvatureEditable: true,
  },
  vhs: {
    id: "vhs",
    labelKey: "player.media.settings.mode.vhs",
    shader: "vhs",
    params: { noise: 0.12, chroma: 1.6, smear: 0.7, tracking: 0.5, wobble: 0.35, tint: 0.5 },
    curvatureEditable: false,
  },
};

export const PLAYER_MODE_IDS = Object.keys(PLAYER_MODES) as PlayerModeId[];

export const PLAYER_CABINETS: Record<PlayerCabinetId, TranslationKey> = {
  none: "player.media.settings.cabinet.none",
  win95: "player.media.settings.cabinet.win95",
  wood: "player.media.settings.cabinet.wood",
};

export const PLAYER_CABINET_IDS = Object.keys(PLAYER_CABINETS) as PlayerCabinetId[];

export const CRT_CURVATURES = [0.02, 0.04, 0.07] as const satisfies readonly CrtCurvature[];

export const CRT_CURVATURE_LABELS: Record<CrtCurvature, TranslationKey> = {
  0.02: "player.media.settings.curvature.soft",
  0.04: "player.media.settings.curvature.classic",
  0.07: "player.media.settings.curvature.deep",
};
