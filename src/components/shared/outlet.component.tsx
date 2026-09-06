import { Outlet } from "@tanstack/react-router";

export default function OutletComponent() {
  return (
    <div
      className="bg-background text-text relative h-screen w-screen overflow-hidden"
      aria-label="iluhaAnime"
    >
      <Outlet />
    </div>
  );
}
