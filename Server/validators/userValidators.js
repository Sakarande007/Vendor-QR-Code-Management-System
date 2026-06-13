import { z } from "zod";

const passwordPolicy = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .regex(/[A-Z]/, "Password must contain an uppercase letter")
  .regex(/\d/, "Password must contain a number")
  .regex(
    /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/,
    "Password must contain a special character"
  );

export const userListQuerySchema = z.object({
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
  cursor: z.string().optional(),
  status: z.enum(["active", "inactive"]).optional(),
  role: z.enum(["vendor", "admin", "superadmin"]).optional(),
  vendorCode: z.string().max(20).optional(),
  search: z.string().max(100).optional(),
});

export const createUserSchema = z.object({
  email: z.string().email("Invalid email").max(255),
  vendorCode: z
    .string()
    .min(1, "Vendor code is required")
    .max(20)
    .regex(/^[A-Za-z0-9_-]+$/, "Invalid vendor code"),
  password: passwordPolicy.optional(),
  role: z.literal("vendor").optional().default("vendor"),
});

export const updateUserSchema = z
  .object({
    role: z.enum(["vendor", "admin", "superadmin"]).optional(),
    status: z.enum(["active", "inactive"]).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided for update",
  });

export const updateMyProfileSchema = z
  .object({
    contactPerson: z.string().max(100).optional().nullable(),
    phone: z.string().max(20).optional().nullable(),
    email: z.string().email("Invalid email").max(255).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided for update",
  });

export const userIdParamSchema = z.object({
  userId: z.coerce.number().int().positive(),
});
