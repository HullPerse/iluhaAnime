import { createRouter, type RouterHistory } from "@tanstack/react-router";

import { routeTree } from "@/routes/__root.tree";

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
