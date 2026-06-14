-- =============================================================================
-- Vendor QR Code Based Invoice Management System — MySQL Schema
-- =============================================================================
-- Engine: InnoDB (row-level locking, FK support, crash-safe transactions)
-- Charset: utf8mb4 (full Unicode incl. emoji; 4-byte per char)
-- Collation: utf8mb4_unicode_ci (proper sorting for international vendor names)
-- Target: MySQL 8.0.16+ (CHECK constraints, JSON, functional indexes)
--
-- Run once on a fresh database:
--   mysql -u root -p < config/schema.sql
-- Or: SOURCE /path/to/schema.sql;
-- =============================================================================

SET NAMES utf8mb4;
SET time_zone = '+00:00';

-- Strict SQL mode: reject invalid dates, division by zero, implicit defaults
SET SESSION sql_mode = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION,ONLY_FULL_GROUP_BY';

-- -----------------------------------------------------------------------------
-- Database
-- -----------------------------------------------------------------------------
CREATE DATABASE IF NOT EXISTS vendor_qr_invoice
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE vendor_qr_invoice;

-- =============================================================================
-- 1. vendors — Master data for supplier organizations
-- =============================================================================
-- vendor_code is the natural business key from ERP; kept as PK for stable FKs
-- and efficient joins (no surrogate key hop on every PO/invoice query).
CREATE TABLE vendors (
  vendor_code       VARCHAR(20)   NOT NULL,
  vendor_name       VARCHAR(255)  NOT NULL,
  address           TEXT,
  gst_no            VARCHAR(20),
  contact_person    VARCHAR(100),
  email             VARCHAR(255)  NOT NULL,
  phone             VARCHAR(20),
  status            ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
  created_at        DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at        DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

  PRIMARY KEY (vendor_code),

  CONSTRAINT chk_vendors_email_format
    CHECK (email REGEXP '^[^@]+@[^@]+\\.[^@]+$'),

  UNIQUE KEY uk_vendors_email (email),
  KEY idx_vendors_status (status),
  KEY idx_vendors_created_at (created_at),
  KEY idx_vendors_vendor_code_status (vendor_code, status)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci
  COMMENT='Vendor master synced from ERP; gates login when status=inactive';

-- =============================================================================
-- 2. users — Portal accounts (vendor, admin, superadmin)
-- =============================================================================
-- vendor_code NULL for admin/superadmin (no vendor scope).
-- password_hash stores bcrypt/argon2 output only — never plaintext.
-- failed_login_attempts + locked_until support account lockout (FRD security).
CREATE TABLE users (
  user_id               INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  vendor_code           VARCHAR(20)     NULL,
  email                 VARCHAR(255)    NOT NULL,
  password_hash         VARCHAR(255)    NOT NULL,
  role                  ENUM('vendor', 'admin', 'superadmin') NOT NULL DEFAULT 'vendor',
  status                ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
  failed_login_attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
  locked_until          DATETIME(3)     NULL,
  last_login            DATETIME(3)     NULL,
  created_at            DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at            DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

  PRIMARY KEY (user_id),

  CONSTRAINT fk_users_vendor
    FOREIGN KEY (vendor_code) REFERENCES vendors (vendor_code)
    ON UPDATE RESTRICT
    ON DELETE RESTRICT,

  -- Vendor-role users must be tied to a vendor; admins may be global.
  -- ON UPDATE RESTRICT (not CASCADE) required: MySQL 8.0.19+ disallows CHECK on
  -- columns used in FK referential actions other than RESTRICT/NO ACTION (#3823).
  CONSTRAINT chk_users_vendor_role_has_code
    CHECK (
      role IN ('admin', 'superadmin')
      OR (role = 'vendor' AND vendor_code IS NOT NULL)
    ),

  CONSTRAINT chk_users_failed_attempts
    CHECK (failed_login_attempts <= 10),

  UNIQUE KEY uk_users_email (email),
  KEY idx_users_vendor_code (vendor_code),
  KEY idx_users_status (status),
  KEY idx_users_created_at (created_at),
  KEY idx_users_vendor_code_status (vendor_code, status)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci
  COMMENT='Authentication identities; vendor isolation via vendor_code';

-- =============================================================================
-- 3. refresh_tokens — Rotating refresh tokens (hashed at rest)
-- =============================================================================
-- token_hash: SHA-256 hex (64 chars) of raw token — never store raw tokens.
-- CASCADE delete when user removed (GDPR / account cleanup).
CREATE TABLE refresh_tokens (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id       INT UNSIGNED    NOT NULL,
  token_hash    CHAR(64)        NOT NULL,
  expires_at    DATETIME(3)     NOT NULL,
  created_at    DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  ip_address    VARCHAR(45)     NULL COMMENT 'IPv4 or IPv6',
  user_agent    VARCHAR(512)    NULL,

  PRIMARY KEY (id),

  CONSTRAINT fk_refresh_tokens_user
    FOREIGN KEY (user_id) REFERENCES users (user_id)
    ON UPDATE CASCADE
    ON DELETE CASCADE,

  CONSTRAINT chk_refresh_tokens_expires_future
    CHECK (expires_at > created_at),

  UNIQUE KEY uk_refresh_tokens_hash (token_hash),
  KEY idx_refresh_tokens_user_id (user_id),
  KEY idx_refresh_tokens_expires_at (expires_at),
  KEY idx_refresh_tokens_created_at (created_at)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci
  COMMENT='Long-lived session rotation; pair with Redis denylist for logout';

-- =============================================================================
-- 4. plants — Manufacturing / delivery sites
-- =============================================================================
CREATE TABLE plants (
  plant_code    VARCHAR(10)   NOT NULL,
  plant_name    VARCHAR(255)  NOT NULL,
  company_code  VARCHAR(10)   NOT NULL,
  status        ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
  created_at    DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (plant_code),

  KEY idx_plants_status (status),
  KEY idx_plants_created_at (created_at),
  KEY idx_plants_company_code (company_code)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci
  COMMENT='Plant master from ERP';

-- =============================================================================
-- 5. storage_locations — Warehouse bins per plant
-- =============================================================================
CREATE TABLE storage_locations (
  id                      INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  plant_code              VARCHAR(10)   NOT NULL,
  storage_location_code   VARCHAR(20)   NOT NULL,
  description             VARCHAR(255),
  created_at              DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (id),

  CONSTRAINT fk_storage_locations_plant
    FOREIGN KEY (plant_code) REFERENCES plants (plant_code)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,

  UNIQUE KEY uk_storage_locations_plant_code (plant_code, storage_location_code),
  KEY idx_storage_locations_plant_code (plant_code),
  KEY idx_storage_locations_created_at (created_at)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci
  COMMENT='Storage location master per plant';

-- =============================================================================
-- 6. materials — Item master
-- =============================================================================
CREATE TABLE materials (
  material_code         VARCHAR(30)   NOT NULL,
  material_description  VARCHAR(500)  NOT NULL,
  uom                   VARCHAR(10)   NOT NULL,
  unit_price            DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
  material_type         VARCHAR(50),
  status                ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
  created_at            DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at            DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

  PRIMARY KEY (material_code),

  KEY idx_materials_status (status),
  KEY idx_materials_created_at (created_at),
  KEY idx_materials_material_type (material_type)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci
  COMMENT='Material master from ERP';

-- =============================================================================
-- 7. po_headers — Purchase order headers (ERP sync)
-- =============================================================================
-- synced_at tracks last ERP pull for incremental sync jobs.
CREATE TABLE po_headers (
  po_number     VARCHAR(30)   NOT NULL,
  vendor_code   VARCHAR(20)   NOT NULL,
  po_date       DATE          NOT NULL,
  plant_code    VARCHAR(10)   NOT NULL,
  department    VARCHAR(50)   NOT NULL DEFAULT 'MOULD' COMMENT 'GRN / QR department e.g. MOULD',
  status        ENUM('open', 'partially_invoiced', 'closed', 'cancelled') NOT NULL DEFAULT 'open',
  total_value   DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
  currency      VARCHAR(5)    NOT NULL DEFAULT 'INR',
  created_at    DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at    DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  synced_at     DATETIME(3)   NULL,

  PRIMARY KEY (po_number),

  CONSTRAINT fk_po_headers_vendor
    FOREIGN KEY (vendor_code) REFERENCES vendors (vendor_code)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,

  CONSTRAINT fk_po_headers_plant
    FOREIGN KEY (plant_code) REFERENCES plants (plant_code)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,

  CONSTRAINT chk_po_headers_total_value_nonneg
    CHECK (total_value >= 0),

  KEY idx_po_headers_vendor_code (vendor_code),
  KEY idx_po_headers_status (status),
  KEY idx_po_headers_created_at (created_at),
  KEY idx_po_headers_po_date (po_date),
  KEY idx_po_headers_vendor_code_status (vendor_code, status),
  KEY idx_po_headers_plant_code (plant_code)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci
  COMMENT='PO header; vendor dashboard filters on vendor_code + status';

-- =============================================================================
-- 8. po_lines — PO line items
-- =============================================================================
-- pending_qty maintained by app/trigger: ordered_qty - received_qty.
-- Composite (po_number, line_no) is the business key for invoice matching.
CREATE TABLE po_lines (
  id                      BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  po_number               VARCHAR(30)     NOT NULL,
  line_no                 INT UNSIGNED    NOT NULL,
  material_code           VARCHAR(30)     NOT NULL,
  ordered_qty             DECIMAL(15, 3)  NOT NULL,
  received_qty            DECIMAL(15, 3)  NOT NULL DEFAULT 0.000,
  pending_qty             DECIMAL(15, 3)  NOT NULL,
  uom                     VARCHAR(10)     NOT NULL,
  storage_location_code   VARCHAR(20),
  unit_price              DECIMAL(15, 2)  NOT NULL DEFAULT 0.00,
  created_at              DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at              DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

  PRIMARY KEY (id),

  CONSTRAINT fk_po_lines_po
    FOREIGN KEY (po_number) REFERENCES po_headers (po_number)
    ON UPDATE CASCADE
    ON DELETE CASCADE,

  CONSTRAINT fk_po_lines_material
    FOREIGN KEY (material_code) REFERENCES materials (material_code)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,

  CONSTRAINT chk_po_lines_ordered_qty_positive
    CHECK (ordered_qty > 0),

  CONSTRAINT chk_po_lines_received_qty_nonneg
    CHECK (received_qty >= 0),

  CONSTRAINT chk_po_lines_pending_qty_nonneg
    CHECK (pending_qty >= 0),

  CONSTRAINT chk_po_lines_qty_balance
    CHECK (received_qty + pending_qty <= ordered_qty + 0.001),

  UNIQUE KEY uk_po_lines_po_line (po_number, line_no),
  KEY idx_po_lines_po_number (po_number),
  KEY idx_po_lines_material_code (material_code),
  KEY idx_po_lines_created_at (created_at),
  KEY idx_po_lines_po_number_line_no (po_number, line_no)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci
  COMMENT='PO lines; invoice qty validated against pending_qty';

-- =============================================================================
-- 9. invoices — Vendor-submitted invoices against POs
-- =============================================================================
-- system_invoice_id: STORED generated column — stable, unique, printable on QR.
-- Format SYS-0000000123 pads invoice_id for fixed-length QR payloads.
-- Invoice number unique per vendor (FRD §6.4), not globally.
CREATE TABLE invoices (
  invoice_id          INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  system_invoice_id   VARCHAR(50)     NOT NULL COMMENT 'INV-{vendorCode}-{YYYYMMDD}-{seq} via Redis INCR',
  invoice_number      VARCHAR(50)     NOT NULL,
  vendor_code         VARCHAR(20)     NOT NULL,
  po_number           VARCHAR(30)     NOT NULL,
  invoice_date        DATE            NOT NULL,
  status              ENUM('draft', 'submitted', 'qr_generated', 'verified', 'rejected') NOT NULL DEFAULT 'draft',
  rejection_reason    VARCHAR(500)    NULL,
  qr_code_data        TEXT            NULL COMMENT 'Legacy/plain QR payload if needed',
  qr_generated_at     DATETIME(3)     NULL,
  submitted_at        DATETIME(3)     NULL,
  created_by          INT UNSIGNED    NOT NULL,
  created_at          DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at          DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

  PRIMARY KEY (invoice_id),

  CONSTRAINT fk_invoices_vendor
    FOREIGN KEY (vendor_code) REFERENCES vendors (vendor_code)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,

  CONSTRAINT fk_invoices_po
    FOREIGN KEY (po_number) REFERENCES po_headers (po_number)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,

  CONSTRAINT fk_invoices_created_by
    FOREIGN KEY (created_by) REFERENCES users (user_id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,

  -- invoice_date <= today: enforced in API/Zod (MySQL 8 #3814 disallows CURDATE() in CHECK)

  CONSTRAINT chk_invoices_submitted_after_create
    CHECK (submitted_at IS NULL OR submitted_at >= created_at),

  CONSTRAINT chk_invoices_qr_generated_after_submit
    CHECK (qr_generated_at IS NULL OR submitted_at IS NULL OR qr_generated_at >= submitted_at),

  UNIQUE KEY uk_invoices_system_invoice_id (system_invoice_id),
  UNIQUE KEY uk_invoices_vendor_invoice_number (vendor_code, invoice_number),
  KEY idx_invoices_vendor_code (vendor_code),
  KEY idx_invoices_po_number (po_number),
  KEY idx_invoices_invoice_number (invoice_number),
  KEY idx_invoices_status (status),
  KEY idx_invoices_created_at (created_at),
  KEY idx_invoices_invoice_date (invoice_date),
  KEY idx_invoices_vendor_code_status (vendor_code, status),
  KEY idx_invoices_invoice_id_status (invoice_id, status)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci
  COMMENT='Invoice header; workflow: draft → submitted → qr_generated → verified';

-- =============================================================================
-- 10. invoice_lines — Invoice line items
-- =============================================================================
CREATE TABLE invoice_lines (
  id                      BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  invoice_id              INT UNSIGNED    NOT NULL,
  po_line_no              INT UNSIGNED    NOT NULL,
  material_code           VARCHAR(30)     NOT NULL,
  plant_code              VARCHAR(10)     NOT NULL,
  storage_location_code   VARCHAR(20),
  invoice_qty             DECIMAL(15, 3)  NOT NULL,
  uom                     VARCHAR(10)     NOT NULL,
  unit_price              DECIMAL(15, 2)  NOT NULL DEFAULT 0.00,
  created_at              DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (id),

  CONSTRAINT fk_invoice_lines_invoice
    FOREIGN KEY (invoice_id) REFERENCES invoices (invoice_id)
    ON UPDATE CASCADE
    ON DELETE CASCADE,

  CONSTRAINT fk_invoice_lines_material
    FOREIGN KEY (material_code) REFERENCES materials (material_code)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,

  CONSTRAINT fk_invoice_lines_plant
    FOREIGN KEY (plant_code) REFERENCES plants (plant_code)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,

  CONSTRAINT chk_invoice_lines_qty_positive
    CHECK (invoice_qty > 0),

  CONSTRAINT chk_invoice_lines_unit_price_nonneg
    CHECK (unit_price >= 0),

  UNIQUE KEY uk_invoice_lines_invoice_po_line (invoice_id, po_line_no),
  KEY idx_invoice_lines_invoice_id (invoice_id),
  KEY idx_invoice_lines_material_code (material_code),
  KEY idx_invoice_lines_created_at (created_at)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci
  COMMENT='Invoice lines; qty must be <= PO pending at application layer';

-- =============================================================================
-- 11. qr_codes — Encrypted QR payload (one per invoice)
-- =============================================================================
-- qr_data_hash enables integrity check without decrypting.
-- scanned_count + last_scanned_at for analytics and dedup with Redis.
CREATE TABLE qr_codes (
  qr_id               INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  invoice_id          INT UNSIGNED    NOT NULL,
  qr_data_encrypted   TEXT            NOT NULL,
  qr_data_hash        CHAR(64)        NOT NULL,
  generated_at        DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  scanned_count       INT UNSIGNED    NOT NULL DEFAULT 0,
  last_scanned_at     DATETIME(3)     NULL,

  PRIMARY KEY (qr_id),

  CONSTRAINT fk_qr_codes_invoice
    FOREIGN KEY (invoice_id) REFERENCES invoices (invoice_id)
    ON UPDATE CASCADE
    ON DELETE CASCADE,

  CONSTRAINT chk_qr_codes_scanned_count_nonneg
    CHECK (scanned_count >= 0),

  UNIQUE KEY uk_qr_codes_invoice_id (invoice_id),
  KEY idx_qr_codes_generated_at (generated_at),
  KEY idx_qr_codes_qr_data_hash (qr_data_hash)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci
  COMMENT='One QR per invoice; encrypted payload for company scanner';

-- =============================================================================
-- 12. audit_logs — Immutable security / compliance trail
-- =============================================================================
-- BIGINT PK: high-volume append-only table (lakhs of events).
-- user_id nullable for system/cron actions.
-- JSON old/new values for field-level forensics.
CREATE TABLE audit_logs (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id       INT UNSIGNED    NULL,
  action        VARCHAR(100)    NOT NULL,
  entity_type   VARCHAR(50)     NOT NULL,
  entity_id     VARCHAR(50)     NOT NULL,
  old_values    JSON            NULL,
  new_values    JSON            NULL,
  ip_address    VARCHAR(45)     NULL,
  user_agent    TEXT            NULL,
  created_at    DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (id),

  CONSTRAINT fk_audit_logs_user
    FOREIGN KEY (user_id) REFERENCES users (user_id)
    ON UPDATE CASCADE
    ON DELETE SET NULL,

  KEY idx_audit_logs_user_id (user_id),
  KEY idx_audit_logs_entity (entity_type, entity_id),
  KEY idx_audit_logs_action (action),
  KEY idx_audit_logs_created_at (created_at),
  KEY idx_audit_logs_entity_created (entity_type, entity_id, created_at)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci
  COMMENT='Append-only audit; partition by RANGE(created_at) in production ops';

-- =============================================================================
-- Triggers: keep po_lines.pending_qty consistent (optional safety net)
-- =============================================================================
DELIMITER $$

CREATE TRIGGER trg_po_lines_before_insert_pending
BEFORE INSERT ON po_lines
FOR EACH ROW
BEGIN
  IF NEW.pending_qty IS NULL OR NEW.pending_qty = 0 THEN
    SET NEW.pending_qty = NEW.ordered_qty - NEW.received_qty;
  END IF;
END$$

CREATE TRIGGER trg_po_lines_before_update_pending
BEFORE UPDATE ON po_lines
FOR EACH ROW
BEGIN
  SET NEW.pending_qty = NEW.ordered_qty - NEW.received_qty;
END$$

DELIMITER ;

-- =============================================================================
-- Optional seed: superadmin placeholder (change password before production)
-- =============================================================================
-- Password must be set via application bcrypt hash; not included in schema.
