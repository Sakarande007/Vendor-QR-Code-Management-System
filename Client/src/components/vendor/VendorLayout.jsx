import { useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { cn } from "../../lib/cn.js";
import { useAuth } from "../../hooks/useAuth.js";
import { Button } from "../ui/Button.jsx";

const NAV_ITEMS = [
  { to: "/dashboard", label: "Dashboard", end: true },
  { to: "/pos", label: "My POs", end: false },
  { to: "/invoices/create", label: "Create Invoice", end: true },
  { to: "/invoices", label: "My Invoices", end: true },
  { to: "/profile", label: "My Profile", end: true },
];

const PAGE_TITLES = {
  "/dashboard": "Dashboard",
  "/pos": "My Purchase Orders",
  "/invoices": "My Invoices",
  "/invoices/create": "Create Invoice",
  "/profile": "My Profile",
};

function NavIcon({ name }) {
  const paths = {
    dashboard: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0h4",
    pos: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2",
    invoice: "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8V6m0 12v-2m9-4a9 9 0 11-18 0 9 9 0 0118 0z",
    create: "M12 4v16m8-8H4",
    profile: "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z",
  };
  return (
    <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d={paths[name] || paths.dashboard} />
    </svg>
  );
}

function getNavIcon(to) {
  if (to === "/dashboard") return "dashboard";
  if (to === "/pos") return "pos";
  if (to === "/invoices/create") return "create";
  if (to === "/invoices") return "invoice";
  return "profile";
}

function resolvePageTitle(pathname) {
  if (pathname.startsWith("/pos/")) return "Purchase Order Details";
  if (pathname.startsWith("/invoices/") && pathname !== "/invoices/create") {
    return "Invoice Details";
  }
  return PAGE_TITLES[pathname] ?? "Vendor Portal";
}

export function VendorLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  const pageTitle = resolvePageTitle(location.pathname);
  const vendorLabel = user?.vendor?.vendorName || user?.email;
  const vendorCode = user?.vendorCode;

  const handleLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  return (
    <div className="flex min-h-svh bg-slate-50">
      {sidebarOpen && (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-navy/50 lg:hidden"
          aria-label="Close sidebar"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        id="vendor-sidebar"
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-slate-200 bg-white transition-transform duration-200 lg:static lg:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
        aria-label="Main navigation"
      >
        <div className="flex h-16 items-center gap-2 border-b border-slate-100 px-5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-sm font-bold text-white">
            QR
          </span>
          <span className="text-sm font-semibold text-navy">Vendor Portal</span>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                  isActive
                    ? "bg-accent/10 text-accent"
                    : "text-slate-600 hover:bg-slate-50 hover:text-navy"
                )
              }
            >
              <NavIcon name={getNavIcon(item.to)} />
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-slate-200 bg-white px-4 shadow-sm sm:px-6">
          <button
            type="button"
            className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            onClick={() => setSidebarOpen(true)}
            aria-expanded={sidebarOpen}
            aria-controls="vendor-sidebar"
          >
            <span className="sr-only">Open menu</span>
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          <h1 className="flex-1 truncate text-lg font-semibold text-navy">{pageTitle}</h1>

          <div className="hidden text-right sm:block">
            <p className="text-sm font-medium text-navy truncate max-w-[200px]">{vendorLabel}</p>
            {vendorCode && (
              <p className="text-xs text-slate-500 font-mono">{vendorCode}</p>
            )}
          </div>

          <div className="relative">
            <button
              type="button"
              className="relative rounded-lg p-2 text-slate-600 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              aria-label="Notifications"
              aria-expanded={notificationsOpen}
              onClick={() => setNotificationsOpen((o) => !o)}
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.75}
                  d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6 6 0 10-12 0v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                />
              </svg>
            </button>
            {notificationsOpen && (
              <div
                role="dialog"
                className="absolute right-0 mt-2 w-72 rounded-lg border border-slate-200 bg-white p-4 shadow-lg"
              >
                <p className="text-sm font-medium text-navy">Notifications</p>
                <p className="mt-2 text-sm text-slate-500">No new notifications.</p>
              </div>
            )}
          </div>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            className="hidden sm:inline-flex"
          >
            Logout
          </Button>
          <button
            type="button"
            className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 sm:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            onClick={handleLogout}
            aria-label="Log out"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.75}
                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
              />
            </svg>
          </button>
        </header>

        <main id="main-content" className="flex-1 p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
