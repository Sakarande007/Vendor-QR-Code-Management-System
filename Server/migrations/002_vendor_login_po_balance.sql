-- =============================================================================
-- 002_vendor_login_po_balance.sql
-- Vendor login (auto-credentials) + SAP Excel PO upload + balance tracking
-- Safe additive migration: new columns and new tables only (no drops).
-- =============================================================================

SET NAMES utf8mb4;

-- --- MODIFY vendors table (ADD columns if not exist) ---
ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS vendor_code_sap VARCHAR(20) UNIQUE COMMENT 'SAP Vendor Code from Excel (e.g. 21549)',
  ADD COLUMN IF NOT EXISTS temp_password VARCHAR(255) COMMENT 'Temp password shown to admin once',
  ADD COLUMN IF NOT EXISTS first_login TINYINT(1) DEFAULT 1 COMMENT '1=must change password on first login',
  ADD COLUMN IF NOT EXISTS created_by INT COMMENT 'admin user_id who created this vendor';

-- --- MODIFY users table (ADD columns if not exist) ---
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS must_change_password TINYINT(1) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS password_changed_at DATETIME NULL;

-- --- MODIFY po_headers table (ADD columns if not exist) ---
ALTER TABLE po_headers
  ADD COLUMN IF NOT EXISTS po_date_raw INT COMMENT 'Original SAP integer date e.g. 20260531',
  ADD COLUMN IF NOT EXISTS upload_batch_id VARCHAR(50) COMMENT 'Links to po_upload_batches',
  ADD COLUMN IF NOT EXISTS source ENUM('manual','excel_upload','api') DEFAULT 'manual';

-- --- MODIFY po_lines table (ADD columns if not exist) ---
ALTER TABLE po_lines
  ADD COLUMN IF NOT EXISTS item_description VARCHAR(500),
  ADD COLUMN IF NOT EXISTS storage_location_raw VARCHAR(20) COMMENT 'SAP Item Store Location value',
  ADD COLUMN IF NOT EXISTS dispatched_qty DECIMAL(15,3) DEFAULT 0 COMMENT 'Total qty sent by vendor so far',
  ADD COLUMN IF NOT EXISTS balance_qty DECIMAL(15,3) COMMENT 'po_qty - dispatched_qty, updated on each invoice submission',
  ADD COLUMN IF NOT EXISTS sr_no INT COMMENT 'SR.NO from SAP Excel';

-- --- NEW TABLE: po_upload_batches ---
CREATE TABLE IF NOT EXISTS po_upload_batches (
  batch_id VARCHAR(50) PRIMARY KEY COMMENT 'UUID generated at upload time',
  uploaded_by INT NOT NULL COMMENT 'admin user_id',
  file_name VARCHAR(255) NOT NULL,
  sheet_name VARCHAR(255) COMMENT 'SAP auto-generated sheet name',
  total_rows INT DEFAULT 0,
  inserted_rows INT DEFAULT 0,
  updated_rows INT DEFAULT 0,
  error_rows INT DEFAULT 0,
  errors JSON COMMENT 'Array of {row, field, message}',
  status ENUM('processing','completed','failed') DEFAULT 'processing',
  uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME NULL,
  INDEX idx_uploaded_by (uploaded_by),
  INDEX idx_uploaded_at (uploaded_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --- NEW TABLE: vendor_dispatch_history ---
-- Tracks every time a vendor sends goods (for balance calculation audit trail)
CREATE TABLE IF NOT EXISTS vendor_dispatch_history (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  po_number VARCHAR(30) NOT NULL,
  po_line_no INT NOT NULL,
  vendor_code VARCHAR(20) NOT NULL,
  material_code VARCHAR(30) NOT NULL,
  invoice_id INT COMMENT 'Links to invoices table',
  system_invoice_id VARCHAR(30),
  dispatched_qty DECIMAL(15,3) NOT NULL,
  balance_before DECIMAL(15,3) NOT NULL COMMENT 'balance_qty before this dispatch',
  balance_after DECIMAL(15,3) NOT NULL COMMENT 'balance_qty after this dispatch',
  dispatch_date DATE NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_vendor_code (vendor_code),
  INDEX idx_po_number (po_number),
  INDEX idx_material_code (material_code),
  INDEX idx_dispatch_date (dispatch_date),
  FOREIGN KEY (po_number) REFERENCES po_headers(po_number) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --- NEW TABLE: vendor_credentials_log ---
-- Admin can see what credentials were generated (temp passwords stored encrypted)
CREATE TABLE IF NOT EXISTS vendor_credentials_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  vendor_code VARCHAR(20) NOT NULL,
  user_id INT NOT NULL,
  generated_by INT NOT NULL COMMENT 'admin user_id',
  generated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  password_reset_at DATETIME NULL,
  INDEX idx_vendor_code (vendor_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --- VIEWS for dashboard queries (fast read) ---
CREATE OR REPLACE VIEW v_vendor_po_balance AS
SELECT
  ph.vendor_code,
  v.vendor_name,
  ph.po_number,
  ph.po_date,
  ph.plant_code,
  ph.status AS po_status,
  pl.id AS line_id,
  pl.line_no,
  pl.sr_no,
  pl.material_code,
  pl.item_description,
  pl.ordered_qty AS po_qty,
  COALESCE(pl.dispatched_qty, 0) AS dispatched_qty,
  COALESCE(pl.balance_qty, pl.ordered_qty) AS balance_qty,
  pl.uom,
  pl.storage_location_raw AS store_location
FROM po_headers ph
JOIN po_lines pl ON ph.po_number = pl.po_number
JOIN vendors v ON ph.vendor_code = v.vendor_code
WHERE ph.status != 'cancelled';
