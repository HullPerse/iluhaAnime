import {
  createRootRoute,
  createRoute,
  createRouter,
  useNavigate,
} from "@tanstack/react-router";
import { CircleX } from "lucide-react";
import { lazy, useEffect } from "react";

import { BigError } from "@/components/shared/error.component";
import { BigLoader } from "@/components/shared/loader.component";
import OutletComponent from "@/components/shared/outlet.component";
import { translate } from "@/lib/i18n";
import { useSettingsStore } from "@/store/settings.store";

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

const ErrorPage = () => {
  const navigate = useNavigate();
  const language = useSettingsStore((state) => state.language);
  return (
    <BigError
      error={new Error(translate(language, "common.error"))}
      icon={<CircleX className="size-28 animate-pulse text-red-500" />}
      onRetry={() => navigate({ to: "/" })}
    />
  );
};

const errorRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/error",
  component: ErrorPage,
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
