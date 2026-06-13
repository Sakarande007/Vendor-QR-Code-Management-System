import { useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { cn } from "../../lib/cn.js";
import { useAuth } from "../../hooks/useAuth.js";
import { Button } from "../ui/Button.jsx";

const NAV_ITEMS = [
  { to: "/admin/dashboard", label: "Dashboard", end: true },
  { to: "/admin/vendors", label: "Vendors", end: true },
  { to: "/admin/pos", label: "Purchase Orders", end: true },
  { to: "/admin/invoices", label: "Invoices", end: true },
  { to: "/admin/masters", label: "Master Data", end: true },
  { to: "/admin/audit-logs", label: "Audit Logs", end: true },
];

const PAGE_TITLES = {
  "/admin/dashboard": "Admin Dashboard",
  "/admin/vendors": "Vendor Management",
  "/admin/pos": "PO Management",
  "/admin/invoices": "Invoice Management",
  "/admin/masters": "Master Data",
  "/admin/audit-logs": "Audit Logs",
};

export function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const pageTitle = PAGE_TITLES[location.pathname] ?? "Admin";

  const handleLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  return (
    <div className="flex min-h-screen bg-slate-100">
      <aside
        className={cn(
          "flex shrink-0 flex-col border-r border-slate-200 bg-navy text-white transition-all duration-200",
          sidebarOpen ? "w-56" : "w-14"
        )}
      >
        <div className="flex h-12 items-center justify-between border-b border-white/10 px-3">
          {sidebarOpen && (
            <Link to="/admin/dashboard" className="text-sm font-semibold tracking-tight">
              VQR Admin
            </Link>
          )}
          <button
            type="button"
            onClick={() => setSidebarOpen((o) => !o)}
            className="rounded p-1.5 hover:bg-white/10"
            aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>
        <nav className="flex-1 space-y-0.5 p-2">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2 rounded-md px-2.5 py-2 text-sm font-medium transition-colors",
                  isActive ? "bg-accent text-white" : "text-slate-300 hover:bg-white/10 hover:text-white"
                )
              }
            >
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-60" aria-hidden="true" />
              {sidebarOpen && item.label}
            </NavLink>
          ))}
        </nav>
        {sidebarOpen && (
          <div className="border-t border-white/10 p-3 text-xs text-slate-400">
            {user?.email ?? user?.fullName ?? "Admin"}
          </div>
        )}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4">
          <h1 className="text-base font-semibold text-navy">{pageTitle}</h1>
          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => navigate("/dashboard")}>
              Vendor portal
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={handleLogout}>
              Sign out
            </Button>
          </div>
        </header>
        <main className="flex-1 overflow-auto p-4">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
