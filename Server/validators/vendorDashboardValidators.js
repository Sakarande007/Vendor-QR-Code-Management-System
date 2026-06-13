import { z } from "zod";

export const vendorPOListQuerySchema = z.object({
  pageSize: z.coerce.number().int().min(1).max(50).optional().default(20),
  cursor: z.string().optional(),
  status: z.enum(["open", "partially_invoiced", "closed"]).optional(),
  plant_code: z.string().max(10).optional(),
  search: z.string().max(50).optional(),
});

export const vendorPONumberParamSchema = z.object({
  poNumber: z.string().min(1).max(30),
});
