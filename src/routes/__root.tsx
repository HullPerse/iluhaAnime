import {
  createRootRoute,
  createRoute,
  createRouter,
  useNavigate,
  type RouterHistory,
} from "@tanstack/react-router";
import { Home, SearchX } from "lucide-react";
import { lazy } from "react";

import { BootPending } from "@/components/shared/bootPending.component";
import { BigLoader } from "@/components/shared/loader.component";
import OutletComponent from "@/components/shared/outlet.component";
import { RouteErrorScreen } from "@/components/shared/routeError.component";
import { Button } from "@/components/ui/button.component";
import ImageComponent from "@/components/ui/image.component";
import { PLAYER_ROUTE } from "@/config/player/player-route.config";
import { useI18n } from "@/hooks/i18n.hook";

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

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: App,
  pendingComponent: BootPending,
});

const playerWindowRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: PLAYER_ROUTE,
  component: PlayerWindow,
  pendingComponent: BigLoader,
});

const routeTree = rootRoute.addChildren([indexRoute, playerWindowRoute]);

export function createAppRouter(history?: RouterHistory) {
  return createRouter({ routeTree, history });
}

export const router = createAppRouter();

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
