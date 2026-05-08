import {
  createRootRoute,
  createRoute,
  createRouter,
  useNavigate,
} from "@tanstack/react-router";
import { lazy, useEffect } from "react";

import OutletComponent from "@/components/shared/outlet.component";
import { BigLoader } from "@/components/shared/loader.component";
import { BigError } from "@/components/shared/error.component";
import { CircleX } from "lucide-react";

const App = lazy(() => import("@/App"));

const rootRoute = createRootRoute({
  component: OutletComponent,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: App,
  pendingComponent: BigLoader,
});

const errorRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/error",
  component: () => (
    <BigError
      error={new Error("Произошла ошибка")}
      icon={<CircleX className="size-28 animate-pulse text-red-500" />}
      button
    />
  ),
});

const routeTree = rootRoute.addChildren([indexRoute, errorRoute]);

const NotFoundRedirect = () => {
  const navigate = useNavigate();

  useEffect(() => {
    navigate({ to: "/error", replace: true });
  }, [navigate]);

  return null;
};

export const router = createRouter({
  routeTree,
  defaultNotFoundComponent: NotFoundRedirect,
});
