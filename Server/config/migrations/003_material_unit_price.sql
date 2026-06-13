-- Add unit price to materials master (safe additive migration).
ALTER TABLE materials
  ADD COLUMN IF NOT EXISTS unit_price DECIMAL(15, 2) NOT NULL DEFAULT 0.00 AFTER uom;
