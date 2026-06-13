-- Legacy manual migration (optional).
-- Prefer: npm run db:migrate  OR restart API (auto-runs ensureInvoiceSchema on boot).
--
-- Use only if invoices.system_invoice_id is a GENERATED column from an old schema import.

USE vendor_qr_invoice;

ALTER TABLE invoices DROP INDEX uk_invoices_system_invoice_id;

ALTER TABLE invoices DROP COLUMN system_invoice_id;

ALTER TABLE invoices
  ADD COLUMN system_invoice_id VARCHAR(50) NOT NULL AFTER invoice_id,
  ADD COLUMN rejection_reason VARCHAR(500) NULL AFTER status,
  ADD UNIQUE KEY uk_invoices_system_invoice_id (system_invoice_id);

UPDATE invoices
SET system_invoice_id = CONCAT('SYS-', LPAD(CAST(invoice_id AS CHAR), 10, '0'))
WHERE system_invoice_id IS NULL OR TRIM(system_invoice_id) = '';
