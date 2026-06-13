/**
 * Query optimization reference — Vendor QR Code Management System
 *
 * Each entry documents the intended EXPLAIN plan, indexes used, and expected
 * improvement at scale (lakhs of vendors / millions of PO & invoice rows).
 *
 * Run locally: EXPLAIN ANALYZE <sql> with representative bind params.
 */

export const QUERY_OPTIMIZATIONS = {
  /**
   * GET /api/pos/mine (vendor PO list)
   * Service: poService.getMyPOs
   *
   * EXPLAIN (expected):
   *   1. po_headers — type: range/ref, key: idx_po_headers_vendor_code_status
   *      (vendor_code = ? AND status IN ('open','partially_invoiced'))
   *   2. plants — type: eq_ref, key: PRIMARY (plant_code)
   *   3. Derived agg on po_lines — type: ref/index, key: idx_po_lines_po_number
   *
   * Avoids wide GROUP BY on po_headers + po_lines join (full line scan per list page).
   * Expected improvement: ~40–60% lower latency for vendors with 5k+ open POs.
   */
  vendorPoList: {
    route: "GET /api/pos/mine",
    indexes: [
      "idx_po_headers_vendor_code_status (vendor_code, status)",
      "idx_po_headers_created_at (ORDER BY created_at DESC)",
      "idx_po_lines_po_number (aggregation subquery)",
    ],
    notes:
      "Keyset pagination uses (created_at, po_number). Optional future index: (vendor_code, status, created_at DESC).",
  },

  /**
   * GET /api/pos/mine/:poNumber (vendor PO detail)
   * Service: poService.getPODetailsForVendor
   *
   * EXPLAIN (expected):
   *   po_headers — const/ref on PRIMARY(po_number) + filter vendor_code, status
   *   po_lines — ref on idx_po_lines_po_number
   *   materials — eq_ref on PRIMARY(material_code)
   *
   * Expected improvement: single-row header lookup + indexed line fetch < 5ms at scale.
   */
  vendorPoDetail: {
    route: "GET /api/pos/mine/:poNumber",
    indexes: ["PRIMARY(po_number)", "idx_po_lines_po_number"],
    notes: "Cached 60s; invalidated on invoice submit for that PO.",
  },

  /**
   * POST /api/invoices/:invoiceId/submit
   * Service: invoiceService.submitInvoiceTransaction
   *
   * Lock order (minimizes deadlock risk):
   *   1. invoices — PRIMARY, status=draft, FOR UPDATE (single row)
   *   2. po_headers + po_lines — one validation pass with FOR UPDATE on PO scope
   *   3. Batch po_lines UPDATE without per-line re-lock
   *
   * EXPLAIN (expected):
   *   invoices — const on PRIMARY(invoice_id)
   *   po_headers — const on PRIMARY(po_number)
   *   po_lines — ref idx_po_lines_po_number FOR UPDATE
   *
   * Expected improvement: ~50–70% shorter lock hold vs per-line FOR UPDATE loop;
   * higher concurrent submit throughput under Bull queue workers.
   */
  invoiceSubmit: {
    route: "POST /api/invoices/:invoiceId/submit",
    indexes: [
      "PRIMARY(invoices.invoice_id)",
      "idx_invoices_invoice_id_status",
      "idx_po_lines_po_number_line_no",
    ],
    notes:
      "High contention handled via Bull queue (invoiceQueue.js) when INVOICE_QUEUE_ENABLED=true.",
  },

  /**
   * Master data reads — cache-aside Redis (masterService + cacheService)
   * Expected improvement: >95% cache hit → sub-ms response; MySQL only on miss/invalidation.
   */
  masterData: {
    route: "GET /api/masters/*",
    indexes: ["idx_plants_status", "idx_materials_status", "idx_storage_locations_plant_code"],
    notes: "TTL 30–60 min plants/materials; invalidate on admin mutations.",
  },

  /**
   * GET /api/qr/:invoiceId/image
   * PNG buffer cached in Redis 24h (immutable after generation).
   * Expected improvement: avoids QRCode.toBuffer on every request (~80ms saved per hit).
   */
  qrImage: {
    route: "GET /api/qr/:invoiceId/image",
    indexes: ["qr_codes.invoice_id UNIQUE"],
    notes: "Cache-Control: private, max-age=86400",
  },
};

export default QUERY_OPTIMIZATIONS;
