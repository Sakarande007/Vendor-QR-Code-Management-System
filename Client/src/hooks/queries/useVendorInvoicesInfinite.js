import { useInfiniteQuery } from "@tanstack/react-query";
import * as vendorApi from "../../api/vendorApi.js";
import { queryKeys } from "../../lib/queryKeys.js";

const PAGE_SIZE = 50;

/**
 * @param {object} filters
 */
export function useVendorInvoicesInfinite(filters = {}) {
  return useInfiniteQuery({
    queryKey: queryKeys.vendorInvoicesInfinite(filters),
    queryFn: async ({ pageParam }) => {
      const params = { pageSize: PAGE_SIZE, cursor: pageParam };
      if (filters.status) params.status = filters.status;
      if (filters.search?.trim()) params.search = filters.search.trim();
      if (filters.dateFrom) params.dateFrom = filters.dateFrom;
      if (filters.dateTo) params.dateTo = filters.dateTo;
      return vendorApi.getMyInvoices(params);
    },
    initialPageParam: undefined,
    getNextPageParam: (lastPage) =>
      lastPage.pagination?.hasMore ? lastPage.pagination.nextCursor : undefined,
  });
}
