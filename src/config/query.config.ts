export const QUERY_CONFIG = {
  defaultOptions: {
    mutations: {
      networkMode: "offlineFirst" as const,
    },
    queries: {
      gcTime: 10 * 60 * 1000,
      networkMode: "offlineFirst" as const,
      refetchOnReconnect: true,
      refetchOnWindowFocus: false,
      retry: (failureCount: number) => failureCount < 2,
      staleTime: 5 * 60 * 1000,
    },
  },
};

export type QueryPresetName = "static" | "slow" | "live" | "realtime";

interface QueryPreset {
  staleTime: number;
  gcTime: number;
  retry: number | false;
  refetchOnWindowFocus: false;
}

export const QUERY_PRESETS: Record<QueryPresetName, QueryPreset> = {
  static: { staleTime: Infinity, gcTime: 60 * 60 * 1000, retry: 1, refetchOnWindowFocus: false },
  slow: {
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 1,
    refetchOnWindowFocus: false,
  },
  live: { staleTime: 5000, gcTime: 10 * 60 * 1000, retry: false, refetchOnWindowFocus: false },
  realtime: {
    staleTime: Infinity,
    gcTime: 10 * 60 * 1000,
    retry: false,
    refetchOnWindowFocus: false,
  },
};
