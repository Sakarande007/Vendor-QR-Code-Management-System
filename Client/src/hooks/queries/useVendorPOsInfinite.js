import { useInfiniteQuery } from "@tanstack/react-query";
import * as vendorApi from "../../api/vendorApi.js";
import { queryKeys } from "../../lib/queryKeys.js";

const PAGE_SIZE = 50;

/**
 * Infinite PO list for virtualized table (accumulates pages client-side).
 * @param {object} filters
 */
export function useVendorPOsInfinite(filters = {}) {
  return useInfiniteQuery({
    queryKey: queryKeys.vendorPOInfinite(filters),
    queryFn: async ({ pageParam }) => {
      const params = { pageSize: PAGE_SIZE, cursor: pageParam };
      if (filters.status) params.status = filters.status;
      if (filters.search?.trim()) params.search = filters.search.trim();
      return vendorApi.getMyPOs(params);
    },
    initialPageParam: undefined,
    getNextPageParam: (lastPage) =>
      lastPage.pagination?.hasMore ? lastPage.pagination.nextCursor : undefined,
  });
}
