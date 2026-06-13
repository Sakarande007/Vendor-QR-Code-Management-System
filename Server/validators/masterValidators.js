import { z } from "zod";

const plantCodeSchema = z
  .string()
  .min(1)
  .max(10)
  .regex(/^[A-Za-z0-9_-]+$/, "Invalid plant code");

const materialCodeSchema = z
  .string()
  .min(1)
  .max(30)
  .regex(/^[A-Za-z0-9_-]+$/, "Invalid material code");

export const createPlantSchema = z.object({
  plantCode: plantCodeSchema,
  plantName: z.string().min(1).max(255),
  companyCode: z.string().min(1).max(10),
  status: z.enum(["active", "inactive"]).optional().default("active"),
});

export const updatePlantSchema = z
  .object({
    plantName: z.string().min(1).max(255).optional(),
    companyCode: z.string().min(1).max(10).optional(),
    status: z.enum(["active", "inactive"]).optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: "At least one field required" });

export const plantCodeParamSchema = z.object({
  plantCode: plantCodeSchema,
});

export const storageLocationQuerySchema = z.object({
  plantCode: plantCodeSchema,
});

export const createStorageLocationSchema = z.object({
  plantCode: plantCodeSchema,
  storageLocationCode: z.string().min(1).max(20).regex(/^[A-Za-z0-9_-]+$/),
  description: z.string().max(255).optional().nullable(),
});

export const updateStorageLocationSchema = z
  .object({
    description: z.string().max(255).optional().nullable(),
    storageLocationCode: z.string().min(1).max(20).regex(/^[A-Za-z0-9_-]+$/).optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: "At least one field required" });

export const storageLocationIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const materialListQuerySchema = z.object({
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
  cursor: z.string().optional(),
  search: z.string().max(100).optional(),
  status: z.enum(["active", "inactive"]).optional().default("active"),
});

const unitPriceSchema = z.coerce.number().nonnegative().max(999999999999.99).optional().default(0);

export const createMaterialSchema = z.object({
  materialCode: materialCodeSchema,
  materialDescription: z.string().min(1).max(500),
  uom: z.string().min(1).max(10),
  unitPrice: unitPriceSchema,
  materialType: z.string().max(50).optional().nullable(),
  status: z.enum(["active", "inactive"]).optional().default("active"),
});

export const updateMaterialSchema = z
  .object({
    materialDescription: z.string().min(1).max(500).optional(),
    uom: z.string().min(1).max(10).optional(),
    unitPrice: unitPriceSchema.optional(),
    materialType: z.string().max(50).optional().nullable(),
    status: z.enum(["active", "inactive"]).optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: "At least one field required" });

export const materialCodeParamSchema = z.object({
  materialCode: materialCodeSchema,
});

export const bulkMaterialRowSchema = z.object({
  materialCode: materialCodeSchema,
  materialDescription: z.string().min(1).max(500),
  uom: z.string().min(1).max(10),
  unitPrice: unitPriceSchema,
  materialType: z.string().max(50).optional().nullable(),
  status: z.enum(["active", "inactive"]).optional().default("active"),
});

export const bulkImportMaterialsSchema = z.object({
  materials: z.array(bulkMaterialRowSchema).min(1).max(1000),
});
