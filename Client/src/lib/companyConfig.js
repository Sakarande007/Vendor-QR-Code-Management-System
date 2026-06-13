/** Company (buyer) details shown on printed invoices — configure via env */
export const companyConfig = {
  name: import.meta.env.VITE_COMPANY_NAME || "Your Company Ltd.",
  legalName: import.meta.env.VITE_COMPANY_LEGAL_NAME || import.meta.env.VITE_COMPANY_NAME || "Your Company Ltd.",
  worksAddresses: import.meta.env.VITE_COMPANY_WORKS_ADDRESSES || "",
  regOffice: import.meta.env.VITE_COMPANY_REG_OFFICE || "",
  address:
    import.meta.env.VITE_COMPANY_ADDRESS ||
    "Registered Office Address\nCity, State — PIN",
  billingLabel: import.meta.env.VITE_COMPANY_BILLING_LABEL || "",
  gstNo: import.meta.env.VITE_COMPANY_GST || "GSTIN: 00AAAAA0000A0Z0",
  panNo: import.meta.env.VITE_COMPANY_PAN || "",
  phone: import.meta.env.VITE_COMPANY_PHONE || "+91 00000 00000",
  fax: import.meta.env.VITE_COMPANY_FAX || "",
  email: import.meta.env.VITE_COMPANY_EMAIL || "",
  logoUrl: import.meta.env.VITE_COMPANY_LOGO_URL || "",
};
