import { useQuery } from "@tanstack/react-query";
import * as vendorApi from "../../api/vendorApi.js";
import { queryKeys } from "../../lib/queryKeys.js";

/**
 * @param {string} poNumber
 */
export function usePODetailQuery(poNumber, options = {}) {
  return useQuery({
    queryKey: queryKeys.poDetail(poNumber),
    queryFn: () => vendorApi.getPODetails(poNumber),
    enabled: Boolean(poNumber),
    ...options,
  });
}
