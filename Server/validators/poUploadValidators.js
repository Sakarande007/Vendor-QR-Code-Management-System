import { z } from "zod";

const poDateRawSchema = z
  .number({
    required_error: "PO Date is required",
    invalid_type_error: "PO Date must be a valid YYYYMMDD integer",
  })
  .int()
  .min(19000101, "PO Date must be a valid YYYYMMDD date")
  .max(20991231, "PO Date must be a valid YYYYMMDD date");

export const sapExcelRowSchema = z.object({
  rowNumber: z.number().int().positive(),
  sr_no: z.union([z.coerce.number().int(), z.string()]).optional().nullable(),
  vendor_code: z.string().min(1, "Vendor Code is required").max(20),
  po_number: z.string().min(1, "PO Number is required").max(30),
  po_date_raw: poDateRawSchema,
  plant_code: z.string().min(1, "Plant is required").max(10),
  line_no: z.coerce.number().int().positive("PO Line Number must be a positive integer"),
  material_code: z.string().min(1, "Material Code is required").max(30),
  item_description: z.string().max(500).optional().nullable(),
  ordered_qty: z.coerce.number().positive("PO Qty must be greater than zero"),
  uom: z.string().min(1, "UOM is required").max(10),
  storage_location_raw: z.string().max(20).optional().nullable(),
  balance_qty_from_sap: z.coerce.number().nonnegative().optional(),
});

/**
 * Validates a parsed SAP Excel row.
 * @param {object} row
 * @param {number} rowNumber Excel row number (1-based)
 * @returns {{ valid: boolean, data?: z.infer<typeof sapExcelRowSchema>, errors: Array<{ row: number, field: string, message: string }> }}
 */
export function validateExcelRow(row, rowNumber) {
  const result = sapExcelRowSchema.safeParse({ ...row, rowNumber });

  if (result.success) {
    return { valid: true, data: result.data, errors: [] };
  }

  const errors = result.error.issues.map((issue) => ({
    row: rowNumber,
    field: issue.path.join(".") || "row",
    message: issue.message,
  }));

  return { valid: false, errors };
}

export const poUploadHistoryQuerySchema = z.object({
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
  cursor: z.string().optional(),
});

export const poUploadBatchIdParamSchema = z.object({
  batchId: z.string().min(1).max(50),
});
