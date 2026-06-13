const currencyFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * @param {number|null|undefined} value
 * @param {string} [currency]
 */
export function formatCurrency(value, currency = "INR") {
  if (value == null || Number.isNaN(Number(value))) {
    return "—";
  }
  if (currency === "INR") {
    return currencyFormatter.format(Number(value));
  }
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value));
}

/**
 * Parses API / DB dates without UTC timezone shifting (YYYY-MM-DD, Date, or SAP YYYYMMDD).
 * @param {string|number|Date|null|undefined} value
 * @returns {Date|null}
 */
export function parseDateOnly(value) {
  if (value == null || value === "") {
    return null;
  }

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      return null;
    }
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }

  const text = String(value).trim();

  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (iso) {
    return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  }

  const digits = text.replace(/\D/g, "");
  if (digits.length === 8) {
    const raw = Number(digits);
    const year = Math.floor(raw / 10000);
    const month = Math.floor((raw % 10000) / 100);
    const day = raw % 100;
    if (year >= 1900 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return new Date(year, month - 1, day);
    }
  }

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

/**
 * SAP display / CSV export: DD.MM.YYYY (e.g. 31.05.2026)
 * @param {string|number|Date|null|undefined} value
 */
export function formatDateSap(value) {
  const date = parseDateOnly(value);
  if (!date) {
    return "";
  }
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = date.getFullYear();
  return `${dd}.${mm}.${yyyy}`;
}

/**
 * @param {string|number|Date|null|undefined} value
 */
export function formatDate(value) {
  const date = parseDateOnly(value);
  if (!date) {
    return "—";
  }
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/** @param {string} status */
export function formatPOStatusLabel(status) {
  const labels = {
    open: "Open",
    partially_invoiced: "Partially Invoiced",
    closed: "Closed",
    cancelled: "Cancelled",
  };
  return labels[status] ?? status;
}

/** @param {string} status */
export function formatInvoiceStatusLabel(status) {
  const labels = {
    draft: "Draft",
    submitted: "Submitted",
    qr_generated: "QR Generated",
    verified: "Verified",
    rejected: "Rejected",
  };
  return labels[status] ?? status;
}
