import {
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
  redirect,
  useNavigate,
  type RouterHistory,
} from "@tanstack/react-router";
import { Home, SearchX } from "lucide-react";
import { lazy } from "react";

import { BootPending } from "@/components/shared/bootPending.component";
import { BigLoader, TabLoader } from "@/components/shared/loader.component";
import OutletComponent from "@/components/shared/outlet.component";
import { RouteErrorScreen } from "@/components/shared/routeError.component";
import { Button } from "@/components/ui/button.component";
import ImageComponent from "@/components/ui/image.component";
import { PLAYER_ROUTE } from "@/config/player/playerRoute.config";
import { settingsSearchSchema } from "@/config/settings/tabs.config";
import { APP_LAYOUT_ROUTE_ID } from "@/config/tabs/routes.config";
import { torrentSearchSchema } from "@/config/torrent/search.config";
import { useI18n } from "@/hooks/i18n.hook";
import { firstEnabledTabPath, isEnabledTabPath } from "@/lib/tabs.utils";

const App = lazy(() => import("@/App"));

const PlayerWindow = lazy(() => import("@/routes/components/player/player.component"));

const NotFoundScreen = () => {
  const navigate = useNavigate();
  const { t } = useI18n();

  return (
    <div className="bg-primary windows95-active-border fixed top-1/2 left-1/2 z-50 flex w-xl max-w-[90%] -translate-x-1/2 -translate-y-1/2 flex-col">
      <section className="bg-secondary flex w-full items-center gap-1 p-1">
        <ImageComponent src="/images/w2k_computer.ico" alt="" className="size-4 shrink-0" />
        <span className="windows95-text text-title-text font-bold">
          {t("common.notFound.title")}
        </span>
      </section>
      <section className="bg-primary flex flex-col items-center gap-4 p-4">
        <SearchX className="text-destructive size-20" />
        <span className="text-text text-center text-base font-bold">
          {t("common.notFound.body")}
        </span>
        <Button className="flex h-8 w-28 items-center gap-1" onClick={() => navigate({ to: "/" })}>
          <Home className="size-4" />
          {t("common.notFound.home")}
        </Button>
      </section>
    </div>
  );
};

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

export function createAppRouter(history?: RouterHistory) {
  return createRouter({
    routeTree,
    history,
    defaultPendingMs: 150,
  });
}

export const router = createAppRouter();

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
