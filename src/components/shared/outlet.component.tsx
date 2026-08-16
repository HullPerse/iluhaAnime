import { Outlet } from "@tanstack/react-router";

export default function OutletComponent() {
  return (
    <main
      className="bg-background text-text relative h-screen w-screen overflow-hidden"
      aria-label="iluhaAnime"
    >
      <Outlet />
    </main>
  );
}
