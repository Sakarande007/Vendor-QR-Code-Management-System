import apiClient from "./apiClient.js";
import { unwrapResponse } from "./errors.js";

// ─── Vendors ─────────────────────────────────────────────────────────────────

export async function getAllVendors(params = {}) {
  const response = await apiClient.get("/api/vendors", { params });
  return unwrapResponse(response);
}

export async function getVendorByCode(vendorCode) {
  const response = await apiClient.get(`/api/vendors/${encodeURIComponent(vendorCode)}`);
  return unwrapResponse(response);
}

export async function createVendor(payload) {
  const response = await apiClient.post("/api/vendors", payload);
  return unwrapResponse(response);
}

export async function updateVendor(vendorCode, payload) {
  const response = await apiClient.patch(
    `/api/vendors/${encodeURIComponent(vendorCode)}`,
    payload
  );
  return unwrapResponse(response);
}

export async function toggleVendorStatus(vendorCode, status) {
  const response = await apiClient.patch(
    `/api/vendors/${encodeURIComponent(vendorCode)}/status`,
    { status }
  );
  return unwrapResponse(response);
}

/**
 * @param {string} vendorCode
 * @param {{ password?: string }} [payload]
 */
export async function resetVendorPassword(vendorCode, payload = {}) {
  const response = await apiClient.post(
    `/api/vendors/${encodeURIComponent(vendorCode)}/reset-password`,
    payload
  );
  return unwrapResponse(response);
}

// ─── Users ───────────────────────────────────────────────────────────────────

export async function getAllUsers(params = {}) {
  const response = await apiClient.get("/api/users", { params });
  return unwrapResponse(response);
}

export async function createUser(payload) {
  const response = await apiClient.post("/api/users", payload);
  return unwrapResponse(response);
}

export async function updateUser(userId, payload) {
  const response = await apiClient.patch(`/api/users/${userId}`, payload);
  return unwrapResponse(response);
}

export async function deleteUser(userId) {
  const response = await apiClient.delete(`/api/users/${userId}`);
  return unwrapResponse(response);
}

// ─── Purchase orders (admin) ─────────────────────────────────────────────────

export async function getAllPOs(params = {}) {
  const response = await apiClient.get("/api/pos", { params });
  return unwrapResponse(response);
}

export async function syncPOFromERP(purchaseOrders) {
  const response = await apiClient.post("/api/pos/sync", { purchaseOrders });
  return unwrapResponse(response);
}

/**
 * @param {File} file
 */
export async function bulkUploadPO(file) {
  const formData = new FormData();
  formData.append("file", file);

  const response = await apiClient.post("/api/pos/upload", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return unwrapResponse(response);
}

// ─── Invoices (admin) ────────────────────────────────────────────────────────

export async function getAllInvoices(params = {}) {
  const response = await apiClient.get("/api/invoices", { params });
  return unwrapResponse(response);
}

export async function getInvoiceDetails(invoiceId) {
  const response = await apiClient.get(`/api/invoices/${invoiceId}`);
  return unwrapResponse(response);
}

export async function updateInvoiceStatus(invoiceId, payload) {
  const response = await apiClient.patch(`/api/invoices/${invoiceId}/status`, payload);
  return unwrapResponse(response);
}

/**
 * Admin: create and submit invoice for a PO line quantity.
 * @param {object} payload
 */
export async function generateInvoiceFromPOLine(payload) {
  const response = await apiClient.post("/api/invoices/generate-from-po-line", payload);
  return unwrapResponse(response);
}

// ─── Admin dashboard & audit ───────────────────────────────────────────────────

export async function getAdminDashboard() {
  const response = await apiClient.get("/api/admin/dashboard");
  return unwrapResponse(response);
}

export async function getAuditLogs(params = {}) {
  const response = await apiClient.get("/api/admin/audit-logs", { params });
  return unwrapResponse(response);
}

export async function getPOSyncHistory(limit = 5) {
  const response = await apiClient.get("/api/admin/po-sync-history", {
    params: { limit },
  });
  return unwrapResponse(response);
}

// ─── Admin PO balance dashboard ──────────────────────────────────────────────

export async function getAdminBalanceDashboard() {
  const response = await apiClient.get("/api/admin/dashboard/balance");
  return unwrapResponse(response);
}

/**
 * @param {string} vendorCode
 */
export async function getVendorPOBalance(vendorCode) {
  const response = await apiClient.get(
    `/api/admin/vendors/${encodeURIComponent(vendorCode)}/po-balance`
  );
  return unwrapResponse(response);
}

/**
 * @param {Record<string, unknown>} [params]
 */
export async function getAllPOBalance(params = {}) {
  const response = await apiClient.get("/api/admin/po-balance", { params });
  return unwrapResponse(response);
}

/**
 * @param {Record<string, unknown>} [params]
 */
export async function getAdminMaterialBalance(params = {}) {
  const response = await apiClient.get("/api/admin/materials/balance", { params });
  return unwrapResponse(response);
}

/**
 * @param {Record<string, unknown>} [params]
 */
export async function exportPOBalance(params = {}) {
  const response = await apiClient.get("/api/admin/po-balance/export", {
    params,
    responseType: "blob",
  });
  return response;
}

/**
 * @param {File} file
 * @param {(progress: number) => void} [onProgress]
 */
export async function uploadPOExcel(file, onProgress) {
  const formData = new FormData();
  formData.append("po_file", file);

  const response = await apiClient.post("/api/admin/po/upload-excel", formData, {
    headers: { "Content-Type": "multipart/form-data" },
    onUploadProgress: (event) => {
      if (onProgress && event.total) {
        onProgress(Math.round((event.loaded * 100) / event.total));
      }
    },
  });

  const body = response.data;
  if (body?.success === false) {
    throw new Error(body.message || "Upload failed");
  }
  return body;
}

/**
 * @param {Record<string, unknown>} [params]
 */
export async function getUploadHistory(params = {}) {
  const response = await apiClient.get("/api/admin/po/upload-history", { params });
  return unwrapResponse(response);
}

/**
 * @param {string} batchId
 */
export async function getUploadBatchDetails(batchId) {
  const response = await apiClient.get(
    `/api/admin/po/upload-history/${encodeURIComponent(batchId)}`
  );
  return unwrapResponse(response);
}
