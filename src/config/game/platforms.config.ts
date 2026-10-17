import type { TranslationKey } from "@/types/i18n";
import type { GamePlatform, GameStorePlatform } from "@/types/game";

export const GAME_PLATFORMS: readonly GamePlatform[] = ["chip8", "schip", "schip11", "xochip"];

export const GAME_PLATFORM_LABELS: Record<GamePlatform, TranslationKey> = {
  chip8: "game.platform.chip8",
  schip: "game.platform.schip",
  schip11: "game.platform.schip11",
  xochip: "game.platform.xochip",
};

/** Store filter order. */
export const GAME_STORE_PLATFORMS: readonly GameStorePlatform[] = ["chip8", "schip", "xochip"];

export const GAME_STORE_PLATFORM_LABELS: Record<GameStorePlatform, TranslationKey> = {
  chip8: "game.platform.chip8",
  schip: "game.platform.schip",
  xochip: "game.platform.xochip",
};
