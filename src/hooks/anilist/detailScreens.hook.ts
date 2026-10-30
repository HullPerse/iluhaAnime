import { useState, useEffect } from "react";
import type { AniListOverlayScreen } from "@/types/anilist/anilist";

export function useDetailScreens(animeId: number, onRelated: ((id: number) => void) | undefined) {
  const [screens, setScreens] = useState<AniListOverlayScreen[]>([]);
  useEffect(() => {
    setScreens([]);
  }, [animeId]);
  const screenTop = screens.at(-1) ?? null;
  const pushScreen = (screen: AniListOverlayScreen) => {
    setScreens((prev) => [...prev, screen]);
  };
  const backScreen = () => {
    setScreens((prev) => prev.slice(0, -1));
  };
  const openAnime = (id: number) => {
    setScreens([]);
    onRelated?.(id);
  };
  return { backScreen, openAnime, pushScreen, screenTop };
}
