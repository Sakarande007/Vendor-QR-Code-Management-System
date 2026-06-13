import apiClient from "./apiClient.js";
import { unwrapResponse } from "./errors.js";

/**
 * @param {{ encryptedPayload: string }} payload
 * @param {string} [apiKey] Optional X-API-Key for company scanners
 */
export async function verifyQR(payload, apiKey) {
  const response = await apiClient.post("/api/qr/verify", payload, {
    skipAuth: true,
    skipAuthRefresh: true,
    headers: apiKey ? { "X-API-Key": apiKey } : undefined,
  });
  return unwrapResponse(response);
}

/**
 * @param {number} invoiceId
 * @returns {Promise<Blob>}
 */
export async function getQRImage(invoiceId) {
  const response = await apiClient.get(`/api/qr/${invoiceId}/image`, {
    responseType: "blob",
  });
  return response.data;
}

/**
 * Per-material QR codes (one per PO line) for an invoice.
 * @param {number} invoiceId
 * @returns {Promise<{ lines: Array<{ poLineNo: number, materialCode: string, qrString: string, qrImageBase64: string }> }>}
 */
export async function getInvoiceLineQRs(invoiceId) {
  const response = await apiClient.get(`/api/qr/${invoiceId}/lines`);
  return unwrapResponse(response);
}

/**
 * @param {number} invoiceId
 */
export async function regenerateQR(invoiceId) {
  const response = await apiClient.post(`/api/qr/${invoiceId}/regenerate`);
  return unwrapResponse(response);
}
