import { Navigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth.js";
import { PageSpinner } from "../components/ui/Spinner.jsx";

/** Sends `/` to the correct home for the logged-in role. */
export function HomeRedirect() {
  const { isAuthenticated, isLoading, isAdmin } = useAuth();

  if (isLoading) {
    return <PageSpinner message="Loading…" />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <Navigate to={isAdmin ? "/admin/dashboard" : "/dashboard"} replace />;
}
