import { lazyRouteComponent } from "@tanstack/react-router";
import { lazy } from "react";

import { BootPending } from "@/components/shared/bootPending.component";
import { BigLoader } from "@/components/shared/loader/big.loader";
import { TabLoader } from "@/components/shared/loader/tab.loader";
import {
  anilistRoute,
  appLayoutRoute,
  collectionRoute,
  gameRoute,
  playerRoute,
  playerWindowRoute,
  rootRoute,
  searchRoute,
  settingsRoute,
  streamRoute,
  torrentRoute,
} from "@/routes/__root.defs";

const App = lazy(() => import("@/App"));

const PlayerWindow = lazy(() => import("@/routes/components/player/player.component"));

appLayoutRoute.update({ component: App, pendingComponent: BootPending });

searchRoute.update({
  component: lazyRouteComponent(() => import("@/routes/search.route")),
  pendingComponent: TabLoader,
});

torrentRoute.update({
  component: lazyRouteComponent(() => import("@/routes/torrent.route")),
  pendingComponent: TabLoader,
});

playerRoute.update({
  component: lazyRouteComponent(() => import("@/routes/player.route")),
  pendingComponent: TabLoader,
});

anilistRoute.update({
  component: lazyRouteComponent(() => import("@/routes/anilist.route")),
  pendingComponent: TabLoader,
});

collectionRoute.update({
  component: lazyRouteComponent(() => import("@/routes/collection.route")),
  pendingComponent: TabLoader,
});

streamRoute.update({
  component: lazyRouteComponent(() => import("@/routes/stream.route")),
  pendingComponent: TabLoader,
});

gameRoute.update({
  component: lazyRouteComponent(() => import("@/routes/game.route")),
  pendingComponent: TabLoader,
});

settingsRoute.update({
  component: lazyRouteComponent(() => import("@/routes/settings.route")),
  pendingComponent: TabLoader,
});

playerWindowRoute.update({ component: PlayerWindow, pendingComponent: BigLoader });

export const routeTree = rootRoute.addChildren([
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
