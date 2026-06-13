import { useQuery } from "@tanstack/react-query";
import * as masterApi from "../../api/masterApi.js";
import { queryKeys } from "../../lib/queryKeys.js";

/**
 * @param {object} [params]
 * @param {object} [options]
 */
export function useMaterialsQuery(params = {}, options = {}) {
  return useQuery({
    queryKey: queryKeys.materials(params),
    queryFn: () => masterApi.getMaterials(params),
    ...options,
  });
}
