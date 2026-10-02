import { Outlet } from "@tanstack/react-router";
import { cn } from "cn";

import { PLAYER_ROUTE } from "@/config/player/player-route.config";

export default function OutletComponent() {
  const isPlayerWindow = window.location.pathname.includes(PLAYER_ROUTE);

  return (
    <div
      className={cn(
        "text-text relative h-screen w-screen overflow-hidden",
        !isPlayerWindow && "bg-background",
      )}
      aria-label="iluhaAnime"
    >
      <Outlet />
    </div>
  );
}
