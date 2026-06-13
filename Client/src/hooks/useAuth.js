import { useContext } from "react";
import { AuthContext } from "../context/AuthContext.jsx";

/**
 * @returns {import('../context/AuthContext.jsx').AuthContext extends React.Context<infer T> ? T : never}
 */
export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }

  return context;
}
