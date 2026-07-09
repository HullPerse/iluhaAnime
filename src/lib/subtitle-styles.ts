import { useSettingsStore } from "@/store/settings.store";

export interface SubtitleStylePreset {
  id: string;
  label: string;
  fontSize: number;
  color: string;
  bgColor: string;
  bgOpacity: number;
  fontFamily: string;
}

export const SUBTITLE_PRESETS: Record<string, SubtitleStylePreset> = {
  light: {
    id: "light",
    label: "Светлые",
    fontSize: 20,
    color: "#000000",
    bgColor: "#ffffff",
    bgOpacity: 80,
    fontFamily: "Arial",
  },
  dark: {
    id: "dark",
    label: "Тёмные",
    fontSize: 20,
    color: "#ffffff",
    bgColor: "#000000",
    bgOpacity: 70,
    fontFamily: "Arial",
  },
  anime: {
    id: "anime",
    label: "Аниме",
    fontSize: 24,
    color: "#ffcc00",
    bgColor: "#000000",
    bgOpacity: 70,
    fontFamily: "Arial",
  },
};

export function applySubtitlePreset(presetId: string) {
  const preset = SUBTITLE_PRESETS[presetId];
  if (!preset) return;
  useSettingsStore.getState().patch({
    subtitleFontSize: preset.fontSize,
    subtitleColor: preset.color,
    subtitleBgColor: preset.bgColor,
    subtitleBgOpacity: preset.bgOpacity,
    subtitleFontFamily: preset.fontFamily,
  });
}

export function getActivePresetId(): string {
  const s = useSettingsStore.getState();
  for (const [id, preset] of Object.entries(SUBTITLE_PRESETS)) {
    if (
      s.subtitleFontSize === preset.fontSize &&
      s.subtitleColor === preset.color &&
      s.subtitleBgColor === preset.bgColor &&
      s.subtitleBgOpacity === preset.bgOpacity
    ) {
      return id;
    }
  }
  return "custom";
}
