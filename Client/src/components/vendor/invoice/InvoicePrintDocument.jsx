import { formatCurrency, formatDateSap } from "../../../lib/format.js";
import { CompanyLogo } from "../../ui/CompanyLogo.jsx";

/**
 * Corporate tax invoice layout (PO-style) for print / Save as PDF.
 * @param {object} props
 * @param {object} props.data
 */
export function InvoicePrintDocument({ data }) {
  if (!data) return null;

  const { invoice, vendor, company, plant, storageLocations, lines, subtotal, qrBase64 } =
    data;

  const billingTitle = company.billingLabel?.trim() || company.legalName || company.name;
  const gstDisplay = (value) => {
    if (!value) return "—";
    const text = String(value).trim();
    return text.toUpperCase().startsWith("GST") ? text : `GSTN : ${text}`;
  };

  return (
    <article className="invoice-print-document" aria-label="Tax invoice">
      {/* Company letterhead */}
      <header className="invoice-print-letterhead">
        <div className="invoice-print-letterhead__brand">
          <CompanyLogo className="invoice-print-logo" height={56} />
        </div>
        <div className="invoice-print-letterhead__works">
          {company.worksAddresses.trim() &&
            company.worksAddresses.split("\n").map((line) => (
              <p key={line}>{line}</p>
            ))}
          {company.regOffice?.trim() && (
            <p className="invoice-print-letterhead__reg">{company.regOffice}</p>
          )}
        </div>
      </header>

      <div className="invoice-print-doc-title-row">
        <h1 className="invoice-print-doc-title">TAX INVOICE</h1>
        <div className="invoice-print-doc-title-meta">
          <span>
            <strong>Invoice No :</strong> {invoice.invoiceNumber}
          </span>
          <span>
            <strong>Date :</strong> {formatDateSap(invoice.invoiceDate)}
          </span>
          <span>
            <strong>PO No :</strong> {invoice.poNumber}
          </span>
        </div>
      </div>

      {/* From (vendor) + Bill To (company) */}
      <section className="invoice-print-parties-po">
        <div className="invoice-print-party-block">
          <h3>From, (Supplier)</h3>
          <p className="invoice-print-party-name">
            {vendor?.vendorName || invoice.vendorName || "—"}
            {vendor?.vendorCode || invoice.vendorCode
              ? ` ${vendor?.vendorCode || invoice.vendorCode}`
              : ""}
          </p>
          {vendor?.address && (
            <p className="invoice-print-party-lines">{vendor.address}</p>
          )}
          {vendor?.phone && <p>Tel : {vendor.phone}</p>}
          {vendor?.email && <p>Email : {vendor.email}</p>}
          <p>{gstDisplay(vendor?.gstNo)}</p>
        </div>

        <div className="invoice-print-party-block">
          <h3>Billing Address:-</h3>
          <p className="invoice-print-party-name">{billingTitle}</p>
          {plant && plant !== "—" && <p>{plant}</p>}
          <p className="invoice-print-party-lines">{company.address}</p>
          {company.phone && <p>Tel : {company.phone}</p>}
          {company.fax && <p>Fax : {company.fax}</p>}
          <p>{gstDisplay(company.gstNo)}</p>
          {company.panNo && <p>PAN No : {company.panNo}</p>}
        </div>
      </section>

      <dl className="invoice-print-meta-po">
        <div>
          <dt>Plant</dt>
          <dd>{plant}</dd>
        </div>
        <div>
          <dt>Storage Location(s)</dt>
          <dd>{storageLocations}</dd>
        </div>
        <div>
          <dt>Vendor Code</dt>
          <dd>{vendor?.vendorCode || invoice.vendorCode || "—"}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>{invoice.status}</dd>
        </div>
      </dl>

      <div className="invoice-print-table-wrap">
        <table className="invoice-print-table invoice-print-table--po">
          <thead>
            <tr>
              <th className="col-sr">Sr. No</th>
              <th className="col-line">PO Line</th>
              <th className="col-code">Item Code</th>
              <th className="col-desc">Item Description</th>
              <th className="col-hsn">HSN/SAC</th>
              <th className="col-qty num">Qty</th>
              <th className="col-uom">Unit</th>
              <th className="col-rate num">Rate (INR)</th>
              <th className="col-amt num">Value (INR)</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((row) => (
              <tr key={row.srNo}>
                <td>{row.srNo}</td>
                <td>{row.poLineNo ?? "—"}</td>
                <td className="invoice-print-mono">{row.materialCode}</td>
                <td>{row.materialDescription}</td>
                <td>—</td>
                <td className="num">{row.invoiceQty}</td>
                <td>{row.uom}</td>
                <td className="num">{formatCurrency(row.unitPrice ?? 0)}</td>
                <td className="num">{formatCurrency(row.lineTotal)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={8} className="num invoice-print-total-label">Total</td>
              <td className="num invoice-print-total-value">{formatCurrency(subtotal)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <section className="invoice-print-terms">
        <h4>Terms &amp; Condition</h4>
        <ol>
          <li>
            Material supplied must conform to PO specifications. Rejected material will be
            returned at supplier cost.
          </li>
          <li>
            Compliance to GST and e-way bill requirements is the supplier&apos;s responsibility.
          </li>
          <li>
            This is a system-generated tax invoice. Scan the QR code below for material
            verification at receipt.
          </li>
        </ol>
      </section>

      <div className="invoice-print-footer-grid">
        <div>
          <span className="invoice-print-footer-label">Mode of Dispatch</span>
          <span>By road / as per PO</span>
        </div>
        <div>
          <span className="invoice-print-footer-label">Delivery Terms</span>
          <span>As per PO {invoice.poNumber}</span>
        </div>
        <div>
          <span className="invoice-print-footer-label">Payment Terms</span>
          <span>As per PO agreement</span>
        </div>
      </div>

      <footer className="invoice-print-footer">
        <p className="invoice-print-declaration">
          We declare that this invoice shows the actual price of the goods described and that all
          particulars are true and correct.
        </p>

        <div className="invoice-print-signature-row">
          <div className="invoice-print-signature-box">Prepared By</div>
          <div className="invoice-print-signature-box">Checked By</div>
          <div className="invoice-print-signature-box">Authorized Signature</div>
        </div>

        {qrBase64 && (
          <section className="invoice-print-footer-qr" aria-label="Invoice QR code">
            <img src={qrBase64} alt="Invoice verification QR code" />
            <p>Invoice verification QR</p>
          </section>
        )}

        <p className="invoice-print-generated-note">
          Computer-generated invoice — {company.name} · Print date {formatDateSap(new Date())}
        </p>
      </footer>
    </article>
  );
}
