import { useQuery } from "@tanstack/react-query";
import * as adminApi from "../../api/adminApi.js";
import { queryKeys } from "../../lib/queryKeys.js";

/**
 * @param {Record<string, unknown>} params
 */
export function useAdminPOBalance(params) {
  return useQuery({
    queryKey: queryKeys.adminPOBalance(params),
    queryFn: () => adminApi.getAllPOBalance(params),
  });
}

/**
 * @param {string|null|undefined} vendorCode
 */
export function useAdminVendorPOBalance(vendorCode) {
  return useQuery({
    queryKey: queryKeys.adminVendorPOBalance(vendorCode),
    queryFn: () => adminApi.getVendorPOBalance(vendorCode),
    enabled: Boolean(vendorCode),
  });
}

/**
 * @param {Record<string, unknown>} [params]
 */
export function useAdminUploadHistory(params = {}) {
  return useQuery({
    queryKey: queryKeys.adminUploadHistory(params),
    queryFn: () => adminApi.getUploadHistory(params),
  });
}

/**
 * @param {string|null|undefined} batchId
 */
export function useAdminUploadBatch(batchId) {
  return useQuery({
    queryKey: queryKeys.adminUploadBatch(batchId),
    queryFn: () => adminApi.getUploadBatchDetails(batchId),
    enabled: Boolean(batchId),
  });
}
