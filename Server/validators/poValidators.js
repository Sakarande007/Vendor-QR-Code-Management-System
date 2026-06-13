import { z } from "zod";

const poNumberSchema = z.string().min(1).max(30);
const vendorCodeSchema = z.string().min(1).max(20);
const plantCodeSchema = z.string().min(1).max(10);
const materialCodeSchema = z.string().min(1).max(30);

const decimalQty = z.coerce.number().nonnegative();
const positiveQty = z.coerce.number().positive();

export const poLineSyncSchema = z
  .object({
    lineNo: z.coerce.number().int().positive(),
    materialCode: materialCodeSchema,
    orderedQty: positiveQty,
    receivedQty: decimalQty.optional().default(0),
    uom: z.string().min(1).max(10),
    storageLocationCode: z.string().max(20).optional().nullable(),
    unitPrice: z.coerce.number().nonnegative().optional().default(0),
  })
  .transform((line) => ({
    ...line,
    receivedQty: line.receivedQty ?? 0,
  }));

export const poSyncItemSchema = z.object({
  poNumber: poNumberSchema,
  vendorCode: vendorCodeSchema,
  poDate: z.coerce.date(),
  plantCode: plantCodeSchema,
  totalValue: z.coerce.number().nonnegative().optional().default(0),
  currency: z.string().max(5).optional().default("INR"),
  status: z.enum(["open", "partially_invoiced", "closed", "cancelled"]).optional(),
  lines: z.array(poLineSyncSchema).min(1),
});

export const poSyncBodySchema = z.object({
  purchaseOrders: z.array(poSyncItemSchema).min(1).max(500),
});

export const vendorPOListQuerySchema = z.object({
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
  cursor: z.string().optional(),
  status: z.enum(["open", "partially_invoiced"]).optional(),
  search: z.string().max(30).optional(),
  plantCode: plantCodeSchema.optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
});

export const adminPOListQuerySchema = z.object({
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
  cursor: z.string().optional(),
  vendorCode: vendorCodeSchema.optional(),
  plantCode: plantCodeSchema.optional(),
  status: z.enum(["open", "partially_invoiced", "closed", "cancelled"]).optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
});

export const poNumberParamSchema = z.object({
  poNumber: poNumberSchema,
});
