import { z } from "zod";

const QTY_EPSILON = 0.001;

/**
 * @param {number|string} value
 */
function roundQty(value) {
  const n = Number(value);
  if (Number.isNaN(n)) return NaN;
  return Math.round(n * 1000) / 1000;
}

export const invoiceLineFormSchema = z.object({
  poLineNo: z.number().int().positive(),
  materialCode: z.string(),
  materialDescription: z.string().optional(),
  pendingQty: z.number(),
  maxInvoiceQty: z.number().optional(),
  currentInvoicedQty: z.number().optional(),
  invoiceQty: z.union([z.string(), z.number()]),
  uom: z.string().min(1).max(10),
  storageLocationCode: z.string().max(20).nullable().optional(),
  plantCode: z.string().min(1).max(10),
  unitPrice: z.number().optional(),
  selected: z.boolean().optional(),
  isDisabled: z.boolean().optional(),
});

/**
 * @param {z.infer<typeof invoiceLineFormSchema>} line
 */
export function validateInvoiceLineQty(line) {
  const pending = roundQty(line.pendingQty);
  const maxQty = roundQty(line.maxInvoiceQty ?? pending);
  if (line.isDisabled || maxQty <= QTY_EPSILON) {
    return { valid: true, message: null };
  }

  const qty = roundQty(line.invoiceQty);
  const hasQty = !Number.isNaN(qty) && qty > 0;

  if (!hasQty) {
    if (line.selected === true) {
      return { valid: false, message: "Invoice quantity is required" };
    }
    return { valid: true, message: null };
  }

  if (line.selected === false) {
    return { valid: true, message: null };
  }

  if (qty > maxQty + QTY_EPSILON) {
    const currentInvoiced = roundQty(line.currentInvoicedQty ?? 0);
    const message =
      currentInvoiced > 0
        ? `Cannot exceed ${maxQty} (${pending} available + ${currentInvoiced} already on invoice)`
        : `Cannot exceed available qty (${maxQty})`;
    return {
      valid: false,
      message,
    };
  }
  return { valid: true, message: null };
}

/**
 * @param {z.infer<typeof invoiceLineFormSchema>[]} lines
 */
export function getActiveInvoiceLines(lines) {
  return lines.filter((line) => {
    if (line.isDisabled || roundQty(line.pendingQty) <= QTY_EPSILON) return false;
    if (line.selected === false) return false;
    const qty = roundQty(line.invoiceQty);
    return !Number.isNaN(qty) && qty > 0;
  });
}

/**
 * Build Zod schema with PO date bounds for invoice date.
 * @param {string|null} poDateInput YYYY-MM-DD
 */
export function createInvoiceWizardSchema(poDateInput) {
  const poDate = poDateInput ? new Date(poDateInput) : null;
  const today = new Date();
  today.setHours(23, 59, 59, 999);

  return z
    .object({
      poNumber: z.string().min(1, "Select a purchase order"),
      invoiceNumber: z.string().min(1, "Invoice number is required").max(50),
      invoiceDate: z.string().min(1, "Invoice date is required"),
      lines: z.array(invoiceLineFormSchema),
    })
    .superRefine((data, ctx) => {
      const invDate = new Date(data.invoiceDate);
      if (Number.isNaN(invDate.getTime())) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Invalid invoice date",
          path: ["invoiceDate"],
        });
        return;
      }

      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      if (invDate > today) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Invoice date cannot be in the future",
          path: ["invoiceDate"],
        });
      }

      if (poDate && !Number.isNaN(poDate.getTime())) {
        const poDay = new Date(poDate);
        poDay.setHours(0, 0, 0, 0);
        if (invDate < poDay) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Invoice date cannot be before PO date",
            path: ["invoiceDate"],
          });
        }
      }

      const activeLines = getActiveInvoiceLines(data.lines);
      if (activeLines.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Enter invoice quantity on at least one line",
          path: ["lines"],
        });
      }

      data.lines.forEach((line, index) => {
        if (!getActiveInvoiceLines([line]).length) return;
        const result = validateInvoiceLineQty(line);
        if (!result.valid) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: result.message ?? "Invalid quantity",
            path: ["lines", index, "invoiceQty"],
          });
        }
      });
    });
}

/** API payload schema aligned with server createInvoiceDraftSchema */
export const createInvoiceDraftPayloadSchema = z.object({
  invoiceNumber: z.string().min(1).max(50),
  invoiceDate: z.coerce.date(),
  poNumber: z.string().min(1).max(30),
  lines: z
    .array(
      z.object({
        poLineNo: z.coerce.number().int().positive(),
        plantCode: z.string().min(1).max(10),
        storageLocationCode: z.string().max(20).optional().nullable(),
        invoiceQty: z.coerce.number().positive(),
        uom: z.string().min(1).max(10),
      })
    )
    .min(1),
});

/**
 * @param {object} formValues
 * @param {string} plantCode
 */
export function toCreateInvoicePayload(formValues, plantCode) {
  const activeLines = getActiveInvoiceLines(formValues.lines).map((line) => ({
    poLineNo: line.poLineNo,
    plantCode,
    storageLocationCode: line.storageLocationCode ?? null,
    invoiceQty: Number(line.invoiceQty),
    uom: line.uom,
  }));

  return {
    invoiceNumber: formValues.invoiceNumber.trim(),
    invoiceDate: formValues.invoiceDate,
    poNumber: formValues.poNumber,
    lines: activeLines,
  };
}
