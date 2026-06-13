import { createContext, useCallback, useEffect, useMemo, useState } from "react";
import * as authApi from "../api/authApi.js";
import * as vendorApi from "../api/vendorApi.js";
import { tokenStore } from "../api/tokenStore.js";
import { parseApiError } from "../api/errors.js";
import { normalizeAuthUser } from "../lib/authUser.js";

const SESSION_KEY = "vqr_session";

/**
 * @typedef {object} AuthUser
 * @property {number} userId
 * @property {string} email
 * @property {string} role
 * @property {string|null} [vendorCode]
 * @property {object} [vendor]
 */

export const AuthContext = createContext(null);

/**
 * Session hint (not a secret). localStorage survives refresh and new tabs.
 */
function saveSession(session) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  }
}

function clearSession() {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
  sessionStorage.removeItem(SESSION_KEY);
}

function loadSession() {
  try {
    const raw =
      localStorage.getItem(SESSION_KEY) ?? sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * @param {object} props
 * @param {import('react').ReactNode} props.children
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const applyAuth = useCallback((accessToken, authUser) => {
    const normalized = normalizeAuthUser(authUser);
    tokenStore.setToken(accessToken);
    setToken(accessToken);
    setUser(normalized);
    saveSession({ userId: normalized.userId, role: normalized.role, email: normalized.email, vendorCode: normalized.vendorCode });
  }, []);

  const clearAuth = useCallback(() => {
    tokenStore.clearToken();
    setToken(null);
    setUser(null);
    clearSession();
  }, []);

  useEffect(() => {
    const storedSession = loadSession();

    (async () => {
      try {
        const data = await authApi.refresh();
        const authUser = normalizeAuthUser(data.user) ?? {
          userId: storedSession?.userId,
          email: storedSession?.email ?? "",
          role: storedSession?.role,
          vendorCode: storedSession?.vendorCode ?? null,
        };

        if (!authUser?.userId || !authUser?.role) {
          throw new Error("Invalid refresh response");
        }

        applyAuth(data.accessToken, authUser);

        try {
          const profileData = await vendorApi.getMyProfile();
          const profile = profileData.profile ?? profileData;

          setUser({
            userId: profile.userId,
            email: profile.email,
            role: profile.role,
            vendorCode: profile.vendorCode ?? null,
            vendor: profile.vendor ?? null,
          });
          saveSession({
            userId: profile.userId,
            role: profile.role,
            email: profile.email,
            vendorCode: profile.vendorCode ?? null,
          });
        } catch {
          // Refresh succeeded — keep session; profile enrichment is optional
        }
      } catch {
        clearAuth();
      } finally {
        setIsLoading(false);
      }
    })();
  }, [applyAuth, clearAuth]);

  /**
   * @param {{ identifier: string, password: string }} credentials
   */
  const login = useCallback(
    async (credentials) => {
      const data = await authApi.login(credentials);

      if (data.mustChangePassword) {
        return {
          mustChangePassword: true,
          tempToken: data.tempToken,
          user: normalizeAuthUser(data.user),
          message: data.message,
        };
      }

      applyAuth(data.accessToken, data.user);

      try {
        const profileData = await vendorApi.getMyProfile();
        const profile = profileData.profile ?? profileData;
        setUser({
          userId: profile.userId,
          email: profile.email,
          role: profile.role,
          vendorCode: profile.vendorCode ?? null,
          vendor: profile.vendor ?? null,
        });
        saveSession({
          userId: profile.userId,
          role: profile.role,
          email: profile.email,
          vendorCode: profile.vendorCode ?? null,
        });
      } catch {
        // Login succeeded; profile enrichment is optional
      }

      return {
        mustChangePassword: false,
        user: normalizeAuthUser(data.user),
      };
    },
    [applyAuth]
  );

  const completeFirstLoginPassword = useCallback(
    async ({ tempToken, newPassword }) => {
      const data = await authApi.completeForcedPasswordChange({
        tempToken,
        newPassword,
      });
      applyAuth(data.accessToken, data.user);

      try {
        const profileData = await vendorApi.getMyProfile();
        const profile = profileData.profile ?? profileData;
        setUser({
          userId: profile.userId,
          email: profile.email,
          role: profile.role,
          vendorCode: profile.vendorCode ?? null,
          vendor: profile.vendor ?? null,
        });
        saveSession({
          userId: profile.userId,
          role: profile.role,
          email: profile.email,
          vendorCode: profile.vendorCode ?? null,
        });
      } catch {
        // Password change succeeded; profile enrichment is optional
      }

      return normalizeAuthUser(data.user);
    },
    [applyAuth]
  );

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch (err) {
      if (import.meta.env.DEV) {
        console.warn("[Auth] Logout API failed", parseApiError(err));
      }
    } finally {
      clearAuth();
    }
  }, [clearAuth]);

  const value = useMemo(
    () => ({
      user,
      token,
      login,
      completeFirstLoginPassword,
      logout,
      isAuthenticated: Boolean(user && token),
      isLoading,
      isAdmin: user?.role === "admin" || user?.role === "superadmin",
      isVendor: user?.role === "vendor",
    }),
    [user, token, login, completeFirstLoginPassword, logout, isLoading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
