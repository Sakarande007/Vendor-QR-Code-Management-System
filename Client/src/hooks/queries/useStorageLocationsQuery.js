import { useQuery } from "@tanstack/react-query";
import * as masterApi from "../../api/masterApi.js";
import { queryKeys } from "../../lib/queryKeys.js";

/**
 * @param {string} [plantCode]
 */
export function useStorageLocationsQuery(plantCode, options = {}) {
  return useQuery({
    queryKey: queryKeys.storageLocations(plantCode),
    queryFn: async () => {
      const data = await masterApi.getStorageLocations(plantCode);
      return data.storageLocations ?? [];
    },
    enabled: Boolean(plantCode),
    ...options,
  });
}
