/**
 * @param {number|string} invoiceId
 * @param {boolean} [autoPrint]
 * @param {{ admin?: boolean }} [options]
 */
export function getInvoicePrintPath(invoiceId, autoPrint = false, options = {}) {
  const base = options.admin
    ? `/admin/invoices/${invoiceId}/print`
    : `/invoices/${invoiceId}/print`;
  return autoPrint ? `${base}?auto=1` : base;
}

/**
 * Navigate to invoice print preview (same tab — keeps auth session).
 * @param {import('react-router-dom').NavigateFunction} navigate
 * @param {number|string} invoiceId
 * @param {boolean} [autoPrint]
 * @param {{ admin?: boolean }} [options]
 */
export function navigateToInvoicePrint(navigate, invoiceId, autoPrint = false, options = {}) {
  navigate(getInvoicePrintPath(invoiceId, autoPrint, options));
}

/**
 * Opens print in a new tab. Prefer navigateToInvoicePrint — new tabs may lose in-memory auth.
 * @param {number|string} invoiceId
 * @param {boolean} [autoPrint] Trigger print dialog when loaded
 * @param {{ admin?: boolean }} [options]
 */
export function openInvoicePrintTab(invoiceId, autoPrint = true, options = {}) {
  const path = getInvoicePrintPath(invoiceId, autoPrint, options);
  window.open(path, "_blank", "noopener");
}
