export const QueryConfig = {
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
