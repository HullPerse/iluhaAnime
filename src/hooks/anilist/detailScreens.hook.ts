import { useEffect, useRef, useState } from "react";
import type {
  AniListOverlayScreen,
} from "@/types/anilist/anilistUi";

export function useDetailScreens(animeId: number, onRelated: ((id: number) => void) | undefined) {
  const [screens, setScreens] = useState<AniListOverlayScreen[]>([]);
  const lastAnimeIdRef = useRef<number>(animeId);
  useEffect(() => {
    if (lastAnimeIdRef.current === animeId) return;
    lastAnimeIdRef.current = animeId;
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
