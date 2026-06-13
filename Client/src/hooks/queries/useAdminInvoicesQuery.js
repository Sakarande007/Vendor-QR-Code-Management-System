import { useQuery } from "@tanstack/react-query";
import * as adminApi from "../../api/adminApi.js";
import { queryKeys } from "../../lib/queryKeys.js";

/**
 * @param {object} params
 */
export function useAdminInvoicesQuery(params = {}) {
  const {
    cursor = null,
    vendorCode = "",
    status = "",
    dateFrom = "",
    dateTo = "",
    pageSize = 20,
  } = params;

  return useQuery({
    queryKey: queryKeys.adminInvoices({ cursor, vendorCode, status, dateFrom, dateTo }),
    queryFn: () =>
      adminApi.getAllInvoices({
        pageSize,
        cursor: cursor ?? undefined,
        vendorCode: vendorCode || undefined,
        status: status || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      }),
  });
}
