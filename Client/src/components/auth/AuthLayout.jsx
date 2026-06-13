import { Link } from "react-router-dom";

/**
 * @param {object} props
 * @param {import('react').ReactNode} props.children
 * @param {string} [props.title]
 * @param {string} [props.subtitle]
 */
export function AuthLayout({ children, title, subtitle }) {
  return (
    <div className="flex min-h-svh bg-slate-50">
      <aside
        className="relative hidden w-[45%] max-w-xl flex-col justify-between bg-navy p-10 text-white lg:flex xl:max-w-2xl"
        aria-hidden="false"
      >
        <div>
          <Link to="/login" className="inline-flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent text-lg font-bold">
              QR
            </span>
            <span className="text-lg font-semibold tracking-tight">Vendor Invoice Portal</span>
          </Link>
        </div>

        <div className="space-y-6">
          <h1 className="text-3xl font-semibold leading-tight tracking-tight xl:text-4xl">
            Trusted invoicing for enterprise supply chains
          </h1>
          <p className="max-w-md text-base leading-relaxed text-slate-300">
            Submit purchase-order invoices with verified QR codes. Built for vendors handling
            high-value transactions with accuracy, auditability, and security.
          </p>
          <ul className="space-y-3 text-sm text-slate-400">
            <li className="flex items-center gap-2">
              <span className="text-accent" aria-hidden="true">
                ●
              </span>
              PO-linked invoice validation
            </li>
            <li className="flex items-center gap-2">
              <span className="text-accent" aria-hidden="true">
                ●
              </span>
              Encrypted QR for gate verification
            </li>
            <li className="flex items-center gap-2">
              <span className="text-accent" aria-hidden="true">
                ●
              </span>
              Real-time status tracking
            </li>
          </ul>
        </div>

        <p className="text-xs text-slate-500">
          © {new Date().getFullYear()} Vendor QR Code Management System
        </p>
      </aside>

      <main className="flex flex-1 flex-col justify-center px-4 py-10 sm:px-8 lg:px-12">
        <div className="mx-auto w-full max-w-md">
          <div className="mb-8 lg:hidden">
            <Link to="/login" className="inline-flex items-center gap-2 text-navy">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-sm font-bold text-white">
                QR
              </span>
              <span className="font-semibold">Vendor Invoice Portal</span>
            </Link>
          </div>

          {(title || subtitle) && (
            <header className="mb-8">
              {title && (
                <h1 className="text-2xl font-semibold tracking-tight text-navy">{title}</h1>
              )}
              {subtitle && <p className="mt-2 text-sm text-slate-600">{subtitle}</p>}
            </header>
          )}

          {children}
        </div>
      </main>
    </div>
  );
}
