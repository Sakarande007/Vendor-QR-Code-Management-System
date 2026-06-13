import apiClient from "./apiClient.js";
import { unwrapResponse } from "./errors.js";

// ─── Dashboard ───────────────────────────────────────────────────────────────

export async function getVendorDashboardSummary() {
  const response = await apiClient.get("/api/vendor/dashboard");
  return unwrapResponse(response);
}

// ─── Profile ─────────────────────────────────────────────────────────────────

export async function getMyProfile() {
  const response = await apiClient.get("/api/users/me");
  return unwrapResponse(response);
}

export async function updateMyProfile(payload) {
  const response = await apiClient.patch("/api/users/me", payload);
  return unwrapResponse(response);
}

// ─── Purchase orders (vendor) ────────────────────────────────────────────────

/**
 * @param {Record<string, unknown>} [params]
 */
export async function getMyPOs(params = {}) {
  const response = await apiClient.get("/api/pos/mine", { params });
  return unwrapResponse(response);
}

/**
 * @param {string} poNumber
 */
export async function getPODetails(poNumber) {
  const response = await apiClient.get(`/api/pos/mine/${encodeURIComponent(poNumber)}`);
  return unwrapResponse(response);
}

// ─── Invoices (vendor) ───────────────────────────────────────────────────────

/**
 * @param {Record<string, unknown>} [params]
 */
export async function getMyInvoices(params = {}) {
  const response = await apiClient.get("/api/invoices/mine", { params });
  return unwrapResponse(response);
}

/**
 * @param {number} invoiceId
 */
export async function getInvoiceDetails(invoiceId) {
  const response = await apiClient.get(`/api/invoices/${invoiceId}`);
  return unwrapResponse(response);
}

/**
 * @param {object} payload
 */
export async function createInvoiceDraft(payload) {
  const response = await apiClient.post("/api/invoices/draft", payload);
  return unwrapResponse(response);
}

/**
 * Create, update draft, submit, or append partial quantities on an existing invoice number.
 * @param {object} payload
 * @param {"draft"|"submit"} mode
 */
export async function persistInvoice(payload, mode) {
  const response = await apiClient.post("/api/invoices/persist", { ...payload, mode });
  return unwrapResponse(response);
}

/**
 * @param {number} invoiceId
 */
export async function submitInvoice(invoiceId) {
  const response = await apiClient.post(`/api/invoices/${invoiceId}/submit`);
  return { ...unwrapResponse(response), httpStatus: response.status };
}
