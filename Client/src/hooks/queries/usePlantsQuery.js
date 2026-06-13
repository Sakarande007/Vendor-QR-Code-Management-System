import { useQuery } from "@tanstack/react-query";
import * as masterApi from "../../api/masterApi.js";
import { queryKeys } from "../../lib/queryKeys.js";

export function usePlantsQuery(options = {}) {
  return useQuery({
    queryKey: queryKeys.plants,
    queryFn: async () => {
      const data = await masterApi.getPlants();
      return data.plants ?? data;
    },
    ...options,
  });
}
