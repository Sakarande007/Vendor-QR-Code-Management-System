import { useQuery } from "@tanstack/react-query";
import * as adminApi from "../../api/adminApi.js";
import { queryKeys } from "../../lib/queryKeys.js";

export function useAdminDashboardQuery() {
  return useQuery({
    queryKey: queryKeys.adminDashboard,
    queryFn: () => adminApi.getAdminDashboard(),
  });
}
