import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth.js";

/** Paths that use vendor-only APIs (/api/pos/mine, /api/invoices/mine, etc.) */
const VENDOR_PORTAL_PREFIXES = ["/dashboard", "/pos", "/invoices", "/profile"];

/**
 * @param {string} pathname
 */
function isVendorPortalPath(pathname) {
  if (
    /^\/invoices\/\d+\/print$/.test(pathname) ||
    /^\/admin\/invoices\/\d+\/print$/.test(pathname)
  ) {
    return false;
  }
  return VENDOR_PORTAL_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

/**
 * @param {object} props
 * @param {boolean} [props.requireAdmin]
 */
export function ProtectedRoute({ requireAdmin = false }) {
  const { isAuthenticated, isLoading, isAdmin, isVendor } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="app-loading">
        <p>Loading session…</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (requireAdmin && !isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  if (isAdmin && isVendorPortalPath(location.pathname)) {
    return <Navigate to="/admin/dashboard" replace />;
  }

  if (isVendor && location.pathname.startsWith("/admin")) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}
