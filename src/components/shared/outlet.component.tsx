import { Outlet } from "@tanstack/react-router";

export default function OutletComponent() {
  return (
    <main className="h-screen w-screen text-text relative overflow-hidden">
      <Outlet />
    </main>
  );
}
