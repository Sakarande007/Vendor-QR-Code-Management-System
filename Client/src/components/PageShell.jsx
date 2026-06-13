import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth.js";

/**
 * @param {object} props
 * @param {string} props.title
 * @param {import('react').ReactNode} [props.children]
 * @param {boolean} [props.showNav]
 */
export function PageShell({ title, children, showNav = true }) {
  const { user, logout, isAdmin } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  return (
    <div className="page-shell">
      {showNav && user && (
        <header className="page-shell__header">
          <nav className="page-shell__nav">
            {isAdmin ? (
              <>
                <Link to="/admin/dashboard">Admin</Link>
                <Link to="/admin/vendors">Vendors</Link>
                <Link to="/admin/pos">POs</Link>
                <Link to="/admin/invoices">Invoices</Link>
                <Link to="/admin/masters">Masters</Link>
              </>
            ) : (
              <>
                <Link to="/dashboard">Dashboard</Link>
                <Link to="/pos">POs</Link>
                <Link to="/invoices">Invoices</Link>
              </>
            )}
          </nav>
          <div className="page-shell__user">
            <span>{user.email}</span>
            <button type="button" onClick={handleLogout}>
              Logout
            </button>
          </div>
        </header>
      )}
      <main className="page-shell__main">
        <h1>{title}</h1>
        {children}
      </main>
    </div>
  );
}
