import { Outlet, useRouterState } from "@tanstack/react-router";
import { cn } from "cn";
import { useEffect } from "react";

import { PLAYER_ROUTE } from "@/config/player/playerRoute.config";

export default function OutletComponent() {
  const isPlayerWindow = useRouterState({
    select: (state) => state.location.pathname === PLAYER_ROUTE,
  });

  useEffect(() => {
    if (!isPlayerWindow) return;
    document.documentElement.dataset.playerWindow = "on";
    return () => {
      delete document.documentElement.dataset.playerWindow;
    };
  }, [isPlayerWindow]);

  return (
    <div
      className={cn(
        "text-text relative h-screen w-screen overflow-hidden",
        !isPlayerWindow && "bg-background"
      )}
      aria-label="iluhaAnime"
    >
      <Outlet />
    </div>
  );
}
