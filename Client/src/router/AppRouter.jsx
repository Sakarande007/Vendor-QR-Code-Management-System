import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { ProtectedRoute } from "./ProtectedRoute.jsx";
import { HomeRedirect } from "./HomeRedirect.jsx";
import { lazyPage } from "../utils/lazyLoad.jsx";

const LoginPage = lazyPage(
  () => import("../pages/auth/LoginPage.jsx"),
  "LoginPage",
  "auth"
);
const ForgotPasswordPage = lazyPage(
  () => import("../pages/auth/ForgotPasswordPage.jsx"),
  "ForgotPasswordPage",
  "auth"
);
const ResetPasswordPage = lazyPage(
  () => import("../pages/auth/ResetPasswordPage.jsx"),
  "ResetPasswordPage",
  "auth"
);
const ForceChangePasswordPage = lazyPage(
  () => import("../pages/auth/ForceChangePasswordPage.jsx"),
  "ForceChangePasswordPage",
  "auth"
);

const VendorLayout = lazyPage(
  () => import("../components/vendor/VendorLayout.jsx"),
  "VendorLayout",
  "page"
);
const AdminLayout = lazyPage(
  () => import("../components/admin/AdminLayout.jsx"),
  "AdminLayout",
  "page"
);

const DashboardPage = lazyPage(
  () => import("../pages/vendor/DashboardPage.jsx"),
  "DashboardPage",
  "dashboard"
);
const POListPage = lazyPage(
  () => import("../pages/vendor/POListPage.jsx"),
  "POListPage",
  "table"
);
const PODetailPage = lazyPage(
  () => import("../pages/vendor/PODetailPage.jsx"),
  "PODetailPage",
  "page"
);
const InvoiceListPage = lazyPage(
  () => import("../pages/vendor/InvoiceListPage.jsx"),
  "InvoiceListPage",
  "table"
);
const CreateInvoicePage = lazyPage(
  () => import("../pages/vendor/CreateInvoicePage.jsx"),
  "CreateInvoicePage",
  "page"
);
const InvoiceDetailPage = lazyPage(
  () => import("../pages/vendor/InvoiceDetailPage.jsx"),
  "InvoiceDetailPage",
  "page"
);
const InvoicePrintPage = lazyPage(
  () => import("../pages/vendor/InvoicePrintPage.jsx"),
  "InvoicePrintPage",
  "page"
);
const VendorProfilePage = lazyPage(
  () => import("../pages/vendor/VendorProfilePage.jsx"),
  "VendorProfilePage",
  "page"
);

const AdminDashboardPage = lazyPage(
  () => import("../pages/admin/AdminDashboardPage.jsx"),
  "AdminDashboardPage",
  "dashboard"
);
const VendorManagementPage = lazyPage(
  () => import("../pages/admin/VendorManagementPage.jsx"),
  "VendorManagementPage",
  "table"
);
const POManagementPage = lazyPage(
  () => import("../pages/admin/POManagementPage.jsx"),
  "POManagementPage",
  "table"
);
const InvoiceManagementPage = lazyPage(
  () => import("../pages/admin/InvoiceManagementPage.jsx"),
  "InvoiceManagementPage",
  "table"
);
const MasterDataPage = lazyPage(
  () => import("../pages/admin/MasterDataPage.jsx"),
  "MasterDataPage",
  "table"
);
const AuditLogPage = lazyPage(
  () => import("../pages/admin/AuditLogPage.jsx"),
  "AuditLogPage",
  "table"
);

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/change-password" element={<ForceChangePasswordPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />

        <Route element={<ProtectedRoute />}>
          <Route path="/invoices/:invoiceId/print" element={<InvoicePrintPage />} />
          <Route path="/admin/invoices/:invoiceId/print" element={<InvoicePrintPage />} />
          <Route element={<VendorLayout />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/pos" element={<POListPage />} />
            <Route path="/pos/:poNumber" element={<PODetailPage />} />
            <Route path="/invoices" element={<InvoiceListPage />} />
            <Route path="/invoices/create" element={<CreateInvoicePage />} />
            <Route path="/invoices/:invoiceId" element={<InvoiceDetailPage />} />
            <Route path="/profile" element={<VendorProfilePage />} />
          </Route>
        </Route>

        <Route element={<ProtectedRoute requireAdmin />}>
          <Route element={<AdminLayout />}>
            <Route path="/admin/dashboard" element={<AdminDashboardPage />} />
            <Route path="/admin/vendors" element={<VendorManagementPage />} />
            <Route path="/admin/pos" element={<POManagementPage />} />
            <Route path="/admin/invoices" element={<InvoiceManagementPage />} />
            <Route path="/admin/masters" element={<MasterDataPage />} />
            <Route path="/admin/audit-logs" element={<AuditLogPage />} />
          </Route>
        </Route>

        <Route path="/" element={<HomeRedirect />} />
        <Route path="*" element={<HomeRedirect />} />
      </Routes>
    </BrowserRouter>
  );
}
