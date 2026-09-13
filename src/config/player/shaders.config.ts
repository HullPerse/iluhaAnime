import type { TranslationKey } from "@/types/i18n";

export const CATEGORY_ORDER = ["preprocess", "restore", "upscale", "postprocess"];

export const SHADER_CATEGORY_LABELS: Record<string, TranslationKey> = {
  preprocess: "player.shader.preprocess",
  restore: "player.shader.restore",
  upscale: "player.shader.upscale",
  postprocess: "player.shader.postprocess",
};
