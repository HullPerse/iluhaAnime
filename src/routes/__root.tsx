import {
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
  redirect,
  type RouterHistory,
} from "@tanstack/react-router";
import { lazy } from "react";

import { BootPending } from "@/components/shared/bootPending.component";
import { BigLoader } from "@/components/shared/loader/big.loader";
import { TabLoader } from "@/components/shared/loader/tab.loader";
import { NotFoundScreen } from "@/components/shared/notFound.component";
import OutletComponent from "@/components/shared/outlet.component";
import { RouteErrorScreen } from "@/components/shared/routeError.component";
import { PLAYER_ROUTE } from "@/config/player/playerRoute.config";
import { settingsSearchSchema } from "@/config/settings/tabs.config";
import { APP_LAYOUT_ROUTE_ID } from "@/config/settings/tabRoutes.config";
import { torrentSearchSchema } from "@/config/search/torrentSearch.config";
import { firstEnabledTabPath, isEnabledTabPath } from "@/lib/ui/tabs.utils";

const App = lazy(() => import("@/App"));

const PlayerWindow = lazy(() => import("@/routes/components/player/player.component"));

const rootRoute = createRootRoute({
  component: OutletComponent,
  errorComponent: RouteErrorScreen,
  notFoundComponent: NotFoundScreen,
});

const appLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: APP_LAYOUT_ROUTE_ID,
  component: App,
  pendingComponent: BootPending,
  beforeLoad: ({ location }) => {
    if (!isEnabledTabPath(location.pathname)) {
      throw redirect({ to: firstEnabledTabPath() });
    }
  },
});

const searchRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/",
  component: lazyRouteComponent(() => import("@/routes/search.route")),
  pendingComponent: TabLoader,
});

export const torrentRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/torrent",
  component: lazyRouteComponent(() => import("@/routes/torrent.route")),
  validateSearch: torrentSearchSchema.parse,
  pendingComponent: TabLoader,
});

const playerRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/player",
  component: lazyRouteComponent(() => import("@/routes/player.route")),
  pendingComponent: TabLoader,
});

const anilistRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/anilist",
  component: lazyRouteComponent(() => import("@/routes/anilist.route")),
  pendingComponent: TabLoader,
});

const collectionRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/collection",
  component: lazyRouteComponent(() => import("@/routes/collection.route")),
  pendingComponent: TabLoader,
});

const streamRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/stream",
  component: lazyRouteComponent(() => import("@/routes/stream.route")),
  pendingComponent: TabLoader,
});

const gameRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/game",
  component: lazyRouteComponent(() => import("@/routes/game.route")),
  pendingComponent: TabLoader,
});

export const settingsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/settings",
  component: lazyRouteComponent(() => import("@/routes/settings.route")),
  validateSearch: settingsSearchSchema.parse,
  pendingComponent: TabLoader,
});

const playerWindowRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: PLAYER_ROUTE,
  component: PlayerWindow,
  pendingComponent: BigLoader,
});

const routeTree = rootRoute.addChildren([
  appLayoutRoute.addChildren([
    searchRoute,
    torrentRoute,
    playerRoute,
    anilistRoute,
    collectionRoute,
    streamRoute,
    settingsRoute,
    gameRoute,
  ]),
  playerWindowRoute,
]);

export const createAppRouter = (history?: RouterHistory) => {
  return createRouter({
    routeTree,
    history,
    defaultPendingMs: 150,
  });
};

export const router = createAppRouter();

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
