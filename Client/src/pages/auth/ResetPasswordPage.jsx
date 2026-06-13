import { Navigate } from "react-router-dom";

/** Legacy route — full reset flow lives on /forgot-password */
export function ResetPasswordPage() {
  return <Navigate to="/forgot-password" replace />;
}
