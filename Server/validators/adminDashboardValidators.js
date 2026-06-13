import { z } from "zod";

const vendorCodeSchema = z.string().min(1).max(20);
const plantCodeSchema = z.string().min(1).max(10);
const poStatusSchema = z.enum(["open", "partially_invoiced", "closed", "cancelled"]);

export const adminVendorCodeParamSchema = z.object({
  vendorCode: vendorCodeSchema,
});

export const adminPOBalanceQuerySchema = z.object({
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(50),
  cursor: z.string().optional(),
  vendor_code: vendorCodeSchema.optional(),
  plant_code: plantCodeSchema.optional(),
  status: poStatusSchema.optional(),
  material_code: z.string().max(30).optional(),
  date_from: z.coerce.date().optional(),
  date_to: z.coerce.date().optional(),
});

export const adminPOBalanceExportQuerySchema = adminPOBalanceQuerySchema.omit({
  pageSize: true,
  cursor: true,
});

export const adminMaterialBalanceQuerySchema = z.object({
  vendor_code: vendorCodeSchema.optional(),
  plant_code: plantCodeSchema.optional(),
});
