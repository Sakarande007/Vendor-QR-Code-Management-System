import { z } from "zod";

export const auditLogListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(50),
  userId: z.coerce.number().int().positive().optional(),
  action: z.string().max(100).optional(),
  entityType: z.string().max(50).optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
});
