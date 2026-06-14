import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as vendorApi from "../../api/vendorApi.js";
import { queryKeys } from "../../lib/queryKeys.js";

/**
 * SAP BAR-code Excel upload (POST /api/pos/mine/upload-excel).
 */
export function useUploadVendorPOExcelMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ file, onProgress }) => vendorApi.uploadPOExcel(file, onProgress),
    retry: false,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vendor", "pos"] });
      qc.invalidateQueries({ queryKey: queryKeys.vendorDashboardSummary });
      qc.invalidateQueries({ queryKey: queryKeys.openPOs });
    },
  });
}
