import { useQuery } from "@tanstack/react-query";
import * as adminApi from "../../api/adminApi.js";
import { queryKeys } from "../../lib/queryKeys.js";

/**
 * @param {object} filters
 */
export function useAuditLogsQuery(filters = {}) {
  const {
    page = 1,
    pageSize = 50,
    userId = "",
    action = "",
    entityType = "",
    dateFrom = "",
    dateTo = "",
  } = filters;

  return useQuery({
    queryKey: queryKeys.auditLogs({ page, userId, action, entityType, dateFrom, dateTo }),
    queryFn: () =>
      adminApi.getAuditLogs({
        page,
        pageSize,
        userId: userId || undefined,
        action: action || undefined,
        entityType: entityType || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      }),
  });
}
