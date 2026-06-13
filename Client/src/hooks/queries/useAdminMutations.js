import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as adminApi from "../../api/adminApi.js";
import { queryKeys } from "../../lib/queryKeys.js";

function invalidateAdminVendors(qc) {
  qc.invalidateQueries({ queryKey: ["admin", "vendors"] });
}

export function useCreateVendorMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload) => adminApi.createVendor(payload),
    onSuccess: () => invalidateAdminVendors(qc),
  });
}

export function useUpdateVendorMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ vendorCode, payload }) => adminApi.updateVendor(vendorCode, payload),
    onSuccess: () => invalidateAdminVendors(qc),
  });
}

export function useToggleVendorStatusMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ vendorCode, status }) => adminApi.toggleVendorStatus(vendorCode, status),
    onSuccess: () => invalidateAdminVendors(qc),
  });
}

export function useResetVendorPasswordMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ vendorCode, password }) =>
      adminApi.resetVendorPassword(vendorCode, password ? { password } : {}),
    onSuccess: () => invalidateAdminVendors(qc),
  });
}

export function useBulkUploadPOMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file) => adminApi.bulkUploadPO(file),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "pos"] });
      qc.invalidateQueries({ queryKey: ["admin", "po-sync-history"] });
    },
  });
}

/**
 * SAP BAR-code Excel upload (POST /api/admin/po/upload-excel).
 */
export function useUploadPOExcelMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ file, onProgress }) => adminApi.uploadPOExcel(file, onProgress),
    retry: false,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "pos"] });
      qc.invalidateQueries({ queryKey: ["admin", "po-balance"] });
      qc.invalidateQueries({ queryKey: ["admin", "po", "upload-history"] });
      qc.invalidateQueries({ queryKey: ["admin", "dashboard", "balance"] });
      qc.invalidateQueries({ queryKey: ["admin", "vendors"] });
    },
  });
}

export function useSyncPOFromERPMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (purchaseOrders) =>
      adminApi.syncPOFromERP(
        Array.isArray(purchaseOrders) ? purchaseOrders : purchaseOrders.purchaseOrders
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "pos"] });
      qc.invalidateQueries({ queryKey: ["admin", "po-sync-history"] });
    },
  });
}

export function useUpdateInvoiceStatusMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ invoiceId, payload }) => adminApi.updateInvoiceStatus(invoiceId, payload),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ["admin", "invoices"] });
      if (variables.payload?.status === "rejected") {
        qc.invalidateQueries({ queryKey: ["admin", "po-balance"] });
        qc.invalidateQueries({ queryKey: ["admin", "dashboard", "balance"] });
      }
    },
  });
}

export function useGenerateInvoiceFromPOLineMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload) => adminApi.generateInvoiceFromPOLine(payload),
    retry: false,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "invoices"] });
      qc.invalidateQueries({ queryKey: ["admin", "po-balance"] });
      qc.invalidateQueries({ queryKey: ["admin", "dashboard", "balance"] });
    },
  });
}

