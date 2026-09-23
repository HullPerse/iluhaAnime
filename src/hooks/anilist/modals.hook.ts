import { useCallback, useState } from "react";

export type AnilistActivityTab = "feed" | "calendar";

export type AnilistModalName =
  | "auth"
  | "recs"
  | "favourites"
  | "browse"
  | "stats"
  | "prefetch"
  | "spotlight"
  | "friends"
  | "filters";

export interface AnilistModalViews extends Record<AnilistModalName, boolean> {
  activity: { open: boolean; tab: AnilistActivityTab };
}

const CLOSED_VIEWS: AnilistModalViews = {
  auth: false,
  recs: false,
  favourites: false,
  browse: false,
  stats: false,
  prefetch: false,
  spotlight: false,
  friends: false,
  filters: false,
  activity: { open: false, tab: "feed" },
};

export function useAnilistModals() {
  const [views, setViews] = useState<AnilistModalViews>(CLOSED_VIEWS);
  const handleOpenModal = useCallback((name: AnilistModalName) => {
    setViews((prev) => (prev[name] ? prev : { ...prev, [name]: true }));
  }, []);
  const handleCloseModal = useCallback((name: AnilistModalName) => {
    setViews((prev) => (prev[name] ? { ...prev, [name]: false } : prev));
  }, []);
  const handleOpenActivity = useCallback((tab: AnilistActivityTab) => {
    setViews((prev) => ({ ...prev, activity: { open: true, tab } }));
  }, []);
  const handleCloseActivity = useCallback(() => {
    setViews((prev) =>
      prev.activity.open ? { ...prev, activity: { ...prev.activity, open: false } } : prev
    );
  }, []);
  return { views, handleOpenModal, handleCloseModal, handleOpenActivity, handleCloseActivity };
}
