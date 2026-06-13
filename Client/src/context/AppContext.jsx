import { createContext, useCallback, useMemo, useState } from "react";
import { usePlantsQuery } from "../hooks/queries/usePlantsQuery.js";
import { useMaterialsQuery } from "../hooks/queries/useMaterialsQuery.js";
import { useAuth } from "../hooks/useAuth.js";

/** @typedef {{ id: string, type: 'success'|'error'|'info'|'warning', message: string }} Toast */

export const AppContext = createContext(null);

let toastIdCounter = 0;

/**
 * @param {object} props
 * @param {import('react').ReactNode} props.children
 */
export function AppProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [materialParams, setMaterialParams] = useState({});
  const { isAuthenticated, isLoading: authLoading, isAdmin } = useAuth();

  // Plants master is only used by admin master-data / PO pages. Gate the eager
  // prefetch to admins so vendor logins don't pay for an unused request.
  const { data: plants, isLoading: plantsLoading } = usePlantsQuery({
    enabled: isAuthenticated && !authLoading && isAdmin,
  });
  const { data: materials, isLoading: materialsLoading } = useMaterialsQuery(materialParams, {
    enabled: Boolean(materialParams.search) || materialParams.enabled === true,
  });

  const showToast = useCallback((message, type = "info") => {
    const id = `toast-${++toastIdCounter}`;
    setToasts((prev) => [...prev, { id, type, message }]);

    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  }, []);

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const loadPlants = useCallback(async () => plants ?? [], [plants]);

  const loadMaterials = useCallback(
    async (params = {}) => {
      setMaterialParams({ ...params, enabled: true });
      return materials ?? { materials: [] };
    },
    [materials]
  );

  const value = useMemo(
    () => ({
      plants,
      materials,
      plantsLoading,
      materialsLoading,
      loadPlants,
      loadMaterials,
      toasts,
      showToast,
      dismissToast,
    }),
    [
      plants,
      materials,
      plantsLoading,
      materialsLoading,
      loadPlants,
      loadMaterials,
      toasts,
      showToast,
      dismissToast,
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
