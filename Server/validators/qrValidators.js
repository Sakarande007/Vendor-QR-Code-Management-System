import { z } from "zod";

export const verifyQRSchema = z.object({
  encryptedPayload: z.string().min(10, "Encrypted payload is required"),
});

export const invoiceIdParamSchema = z.object({
  invoiceId: z.coerce.number().int().positive(),
});
