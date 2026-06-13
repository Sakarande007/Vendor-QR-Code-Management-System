/**
 * Normalizes login/profile user payloads (snake_case or camelCase).
 * @param {object|null|undefined} raw
 */
export function normalizeAuthUser(raw) {
  if (!raw) {
    return null;
  }

  return {
    userId: raw.userId ?? raw.user_id,
    email: raw.email,
    role: raw.role,
    vendorCode: raw.vendorCode ?? raw.vendor_code ?? null,
    vendorCodeSap: raw.vendorCodeSap ?? raw.vendor_code_sap ?? null,
    vendorName: raw.vendorName ?? raw.vendor_name ?? null,
    mustChangePassword:
      raw.mustChangePassword ?? raw.must_change_password ?? false,
  };
}
