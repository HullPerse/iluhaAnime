/// <reference types="vite/client" />

declare module "d3-timer";

interface Window {
  __iluhaTransportStats?: () => import("@/types/core/transport").TransportStats[];
  __iluhaQueryClient?: import("@tanstack/react-query").QueryClient;
}
