import { useQuery } from "@tanstack/react-query";
import * as adminApi from "../../api/adminApi.js";
import { queryKeys } from "../../lib/queryKeys.js";

/**
 * @param {{ cursor?: string|null, search?: string, pageSize?: number }} params
 */
export function useAdminVendorsQuery(params = {}) {
  const { cursor = null, search = "", pageSize = 20 } = params;

  return useQuery({
    queryKey: queryKeys.adminVendors({ cursor, search }),
    queryFn: () =>
      adminApi.getAllVendors({
        pageSize,
        cursor: cursor ?? undefined,
        search: search || undefined,
      }),
  });
}

/** Vendor dropdown list (admin) */
export function useAdminVendorsLookupQuery(pageSize = 100) {
  return useQuery({
    queryKey: [...queryKeys.adminVendors({ lookup: true }), pageSize],
    queryFn: () => adminApi.getAllVendors({ pageSize }),
    staleTime: 60_000,
  });
}
