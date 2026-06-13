import { useQuery } from "@tanstack/react-query";
import * as adminApi from "../../api/adminApi.js";
import { queryKeys } from "../../lib/queryKeys.js";

/**
 * @param {{ cursor?: string|null, vendorCode?: string, pageSize?: number }} params
 */
export function useAdminPOsQuery(params = {}) {
  const { cursor = null, vendorCode = "", pageSize = 20 } = params;

  return useQuery({
    queryKey: queryKeys.adminPOs({ cursor, vendorCode }),
    queryFn: () =>
      adminApi.getAllPOs({
        pageSize,
        cursor: cursor ?? undefined,
        vendorCode: vendorCode || undefined,
      }),
  });
}

export function usePOSyncHistoryQuery(limit = 5) {
  return useQuery({
    queryKey: queryKeys.poSyncHistory(limit),
    queryFn: () => adminApi.getPOSyncHistory(limit),
    staleTime: 30_000,
  });
}
