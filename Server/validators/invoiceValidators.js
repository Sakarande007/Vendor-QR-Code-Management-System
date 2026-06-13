import { z } from "zod";

const poNumberSchema = z.string().min(1).max(30);
const plantCodeSchema = z.string().min(1).max(10);

export const invoiceLineInputSchema = z.object({
  poLineNo: z.coerce.number().int().positive(),
  plantCode: plantCodeSchema,
  storageLocationCode: z.string().max(20).optional().nullable(),
  invoiceQty: z.coerce.number().positive(),
  uom: z.string().min(1).max(10),
});

export const createInvoiceDraftSchema = z.object({
  invoiceNumber: z.string().min(1).max(50),
  invoiceDate: z.coerce.date(),
  poNumber: poNumberSchema,
  lines: z.array(invoiceLineInputSchema).min(1),
});

export const persistInvoiceSchema = createInvoiceDraftSchema.extend({
  mode: z.enum(["draft", "submit"]),
});

export const vendorInvoiceListQuerySchema = z.object({
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
  cursor: z.string().optional(),
  status: z
    .enum(["draft", "submitted", "qr_generated", "verified", "rejected"])
    .optional(),
  search: z.string().max(50).optional(),
  poNumber: poNumberSchema.optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
});

export const adminInvoiceListQuerySchema = vendorInvoiceListQuerySchema.extend({
  vendorCode: z.string().max(20).optional(),
});

export const invoiceIdParamSchema = z.object({
  invoiceId: z.coerce.number().int().positive(),
});

export const adminGenerateInvoiceFromPOLineSchema = z.object({
  vendorCode: z.string().min(1).max(20),
  poNumber: poNumberSchema,
  lines: z.array(invoiceLineInputSchema).min(1),
  invoiceNumber: z.string().min(1).max(50).optional(),
  invoiceDate: z.coerce.date().optional(),
});

export const updateInvoiceStatusSchema = z
  .object({
    status: z.enum(["verified", "rejected"]),
    reason: z.string().max(500).optional(),
  })
  .refine((data) => data.status !== "rejected" || (data.reason && data.reason.trim().length > 0), {
    message: "Rejection reason is required",
    path: ["reason"],
  });
