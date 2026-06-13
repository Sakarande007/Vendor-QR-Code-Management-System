import { z } from "zod";

const passwordPolicy = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .regex(/[a-z]/, "Password must contain a lowercase letter")
  .regex(/[A-Z]/, "Password must contain an uppercase letter")
  .regex(/\d/, "Password must contain a number")
  .regex(
    /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/,
    "Password must contain a special character"
  );

/** Login with vendor_code OR email */
export const loginSchema = z.object({
  identifier: z
    .string()
    .min(1, "Vendor code or email is required")
    .max(255),
  password: z.string().min(1, "Password is required"),
});

/** Admin creates vendor portal user */
export const registerSchema = z.object({
  email: z.string().email("Invalid email address").max(255),
  vendorCode: z
    .string()
    .min(1, "Vendor code is required")
    .max(20)
    .regex(/^[A-Za-z0-9_-]+$/, "Invalid vendor code format"),
  password: passwordPolicy.optional(),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email("Invalid email address").max(255),
});

export const resetPasswordSchema = z.object({
  email: z.string().email("Invalid email address").max(255),
  otp: z
    .string()
    .length(6, "OTP must be 6 digits")
    .regex(/^\d{6}$/, "OTP must be numeric"),
  newPassword: passwordPolicy,
});

export const forcedChangePasswordSchema = z.object({
  temp_token: z.string().min(1, "Temporary token is required"),
  newPassword: passwordPolicy,
});

export const normalChangePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: passwordPolicy,
});

export const changePasswordSchema = z.union([
  forcedChangePasswordSchema,
  normalChangePasswordSchema,
]);
