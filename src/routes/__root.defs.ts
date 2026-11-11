import { createRootRoute, createRoute, redirect } from "@tanstack/react-router";

import { NotFoundScreen } from "@/components/shared/notFound.component";
import OutletComponent from "@/components/shared/outlet.component";
import { RouteErrorScreen } from "@/components/shared/routeError.component";
import { PLAYER_ROUTE } from "@/config/player/playerRoute.config";
import { settingsSearchSchema } from "@/config/settings/tabs.config";
import { APP_LAYOUT_ROUTE_ID } from "@/config/settings/tabRoutes.config";
import { torrentSearchSchema } from "@/config/search/torrentSearch.config";
import { firstEnabledTabPath, isEnabledTabPath } from "@/lib/ui/tabs.utils";

export const rootRoute = createRootRoute({
  component: OutletComponent,
  errorComponent: RouteErrorScreen,
  notFoundComponent: NotFoundScreen,
});

export const appLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: APP_LAYOUT_ROUTE_ID,
  beforeLoad: ({ location }) => {
    if (!isEnabledTabPath(location.pathname)) {
      throw redirect({ to: firstEnabledTabPath() });
    }
  },
});

export const searchRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/",
});

export const torrentRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/torrent",
  validateSearch: torrentSearchSchema.parse,
});

export const playerRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/player",
});

export const anilistRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/anilist",
});

export const collectionRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/collection",
});

export const streamRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/stream",
});

export const gameRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/game",
});

export const settingsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/settings",
  validateSearch: settingsSearchSchema.parse,
});

export const playerWindowRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: PLAYER_ROUTE,
});
