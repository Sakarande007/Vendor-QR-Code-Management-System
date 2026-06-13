import { QueryClient } from "@tanstack/react-query";

/**
 * Shared React Query client — staleTime 30s, gcTime 5min, focus refetch, retry with backoff.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      retry: (failureCount, error) => {
        const status = error?.response?.status;
        if (status && status >= 400 && status < 500) {
          return false;
        }
        return failureCount < 2;
      },
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10_000),
    },
    mutations: {
      retry: 1,
      retryDelay: 1000,
    },
  },
});
