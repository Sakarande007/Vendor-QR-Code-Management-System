import { z } from "zod";

const vendorCodeSchema = z
  .string()
  .min(1, "Vendor code is required")
  .max(20)
  .regex(/^[A-Za-z0-9_-]+$/, "Vendor code must be alphanumeric");

const vendorCodeSapSchema = z
  .string()
  .min(1, "SAP vendor code is required")
  .max(20)
  .regex(/^[a-zA-Z0-9]+$/, "SAP vendor code must be alphanumeric");

const optionalPhone = z.string().max(20).optional().nullable();
const optionalAddress = z.string().max(5000).optional().nullable();
const optionalGst = z.string().max(20).optional().nullable();
const optionalContact = z.string().max(100).optional().nullable();

const optionalPassword = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128)
  .optional();

const createVendorBodySchema = z.object({
  vendorCodeSap: vendorCodeSapSchema,
  vendorName: z
    .string()
    .min(3, "Vendor name must be at least 3 characters")
    .max(255),
  email: z.string().email("Invalid email").max(255),
  password: optionalPassword,
  phone: optionalPhone,
  address: optionalAddress,
  gstNo: optionalGst,
  contactPerson: optionalContact,
  status: z.enum(["active", "inactive"]).optional().default("active"),
});

/** Accepts camelCase or snake_case JSON bodies for admin vendor create. */
export const createVendorSchema = z.preprocess((body) => {
  if (!body || typeof body !== "object") {
    return body;
  }
  const b = /** @type {Record<string, unknown>} */ (body);
  return {
    vendorCodeSap: b.vendorCodeSap ?? b.vendor_code_sap ?? b.vendorCode,
    vendorName: b.vendorName ?? b.vendor_name,
    email: b.email,
    password: b.password,
    phone: b.phone,
    address: b.address,
    gstNo: b.gstNo ?? b.gst_no,
    contactPerson: b.contactPerson ?? b.contact_person,
    status: b.status,
  };
}, createVendorBodySchema);

export const resetVendorPasswordSchema = z.object({
  password: optionalPassword,
});

const vendorFields = {
  vendorName: z.string().min(1, "Vendor name is required").max(255),
  address: optionalAddress,
  gstNo: optionalGst,
  contactPerson: optionalContact,
  email: z.string().email("Invalid email").max(255),
  phone: optionalPhone,
  status: z.enum(["active", "inactive"]).optional(),
};

export const updateVendorSchema = z
  .object({
    vendorName: vendorFields.vendorName.optional(),
    address: vendorFields.address,
    gstNo: vendorFields.gstNo,
    contactPerson: vendorFields.contactPerson,
    email: vendorFields.email.optional(),
    phone: vendorFields.phone,
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided for update",
  });

export const vendorListQuerySchema = z.object({
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
  cursor: z.string().optional(),
  status: z.enum(["active", "inactive"]).optional(),
  search: z.string().max(100).optional(),
});

export const vendorCodeParamSchema = z.object({
  vendorCode: vendorCodeSchema,
});

export const toggleVendorStatusSchema = z.object({
  status: z.enum(["active", "inactive"]),
});
