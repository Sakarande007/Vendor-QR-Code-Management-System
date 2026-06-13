const QTY_EPSILON = 0.001;

/**
 * Derives pending quantity from ordered and received — never trust client values.
 * @param {number|string} orderedQty
 * @param {number|string} receivedQty
 * @returns {number}
 */
export function calculatePendingQty(orderedQty, receivedQty) {
  const ordered = Number(orderedQty);
  const received = Number(receivedQty);

  if (Number.isNaN(ordered) || Number.isNaN(received)) {
    return 0;
  }

  const pending = ordered - received;
  return Math.max(0, Math.round(pending * 1000) / 1000);
}

/**
 * @typedef {object} POLineQty
 * @property {number} orderedQty
 * @property {number} receivedQty
 * @property {number} [pendingQty]
 */

/**
 * Determines PO header status from line quantities.
 * @param {POLineQty[]} lines
 * @returns {'open'|'partially_invoiced'|'closed'}
 */
export function determinePOStatus(lines) {
  if (!lines.length) {
    return "open";
  }

  const normalized = lines.map((line) => {
    const ordered = Number(line.orderedQty);
    const received = Number(line.receivedQty);
    const pending =
      line.pendingQty !== undefined
        ? Number(line.pendingQty)
        : calculatePendingQty(ordered, received);

    return { ordered, received, pending };
  });

  const allClosed = normalized.every((l) => l.pending <= QTY_EPSILON);
  if (allClosed) {
    return "closed";
  }

  const allOpen = normalized.every(
    (l) => Math.abs(l.pending - l.ordered) <= QTY_EPSILON
  );
  if (allOpen) {
    return "open";
  }

  return "partially_invoiced";
}

/**
 * Determines PO header status from SAP balance columns (balance_qty vs ordered_qty).
 * @param {Array<{ orderedQty: number, balanceQty: number }>} lines
 * @returns {'open'|'partially_invoiced'|'closed'}
 */
export function determinePOStatusFromBalance(lines) {
  if (!lines.length) {
    return "open";
  }

  const normalized = lines.map((line) => ({
    ordered: Number(line.orderedQty),
    balance: Number(line.balanceQty),
  }));

  const allClosed = normalized.every((l) => l.balance <= QTY_EPSILON);
  if (allClosed) {
    return "closed";
  }

  const allOpen = normalized.every(
    (l) => Math.abs(l.balance - l.ordered) <= QTY_EPSILON
  );
  if (allOpen) {
    return "open";
  }

  return "partially_invoiced";
}

/**
 * Validates invoice quantity against PO pending quantity.
 * @param {number|string} invoiceQty
 * @param {number|string} pendingQty
 * @returns {{ valid: boolean, message: string|null }}
 */
export function validatePOLineQty(invoiceQty, pendingQty) {
  const invoice = Number(invoiceQty);
  const pending = Number(pendingQty);

  if (Number.isNaN(invoice) || invoice <= 0) {
    return { valid: false, message: "Invoice quantity must be greater than zero" };
  }

  if (Number.isNaN(pending)) {
    return { valid: false, message: "Invalid pending quantity on purchase order line" };
  }

  if (invoice > pending + QTY_EPSILON) {
    return {
      valid: false,
      message: `Invoice quantity (${invoice}) exceeds pending quantity (${pending})`,
    };
  }

  return { valid: true, message: null };
}
