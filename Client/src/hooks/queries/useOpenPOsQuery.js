import { useQuery } from "@tanstack/react-query";
import * as vendorApi from "../../api/vendorApi.js";
import { queryKeys } from "../../lib/queryKeys.js";

/** Open PO list for PO selector dropdown */
export function useOpenPOsQuery() {
  return useQuery({
    queryKey: queryKeys.openPOs,
    queryFn: () => vendorApi.getMyPOs({ pageSize: 100 }),
    select: (data) => data.purchaseOrders ?? [],
    staleTime: 30_000,
  });
}
