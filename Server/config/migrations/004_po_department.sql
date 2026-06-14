-- PO header department for QR barcode (default MOULD).
ALTER TABLE po_headers
  ADD COLUMN IF NOT EXISTS department VARCHAR(50) NOT NULL DEFAULT 'MOULD'
    COMMENT 'GRN / QR department e.g. MOULD'
    AFTER plant_code;

UPDATE po_headers
SET department = 'MOULD'
WHERE department IS NULL OR TRIM(department) = '';
