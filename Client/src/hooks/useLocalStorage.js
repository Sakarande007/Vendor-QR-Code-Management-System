import { useCallback, useState } from "react";

/**
 * Safe localStorage for UI preferences only — never tokens or secrets.
 * @template T
 * @param {string} key
 * @param {T} initialValue
 */
export function useLocalStorage(key, initialValue) {
  const readValue = useCallback(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch {
      return initialValue;
    }
  }, [key, initialValue]);

  const [storedValue, setStoredValue] = useState(readValue);

  const setValue = useCallback(
    (value) => {
      try {
        const valueToStore = value instanceof Function ? value(storedValue) : value;
        setStoredValue(valueToStore);
        window.localStorage.setItem(key, JSON.stringify(valueToStore));
      } catch (err) {
        if (import.meta.env.DEV) {
          console.warn(`[useLocalStorage] Failed to set ${key}`, err);
        }
      }
    },
    [key, storedValue]
  );

  const removeValue = useCallback(() => {
    try {
      window.localStorage.removeItem(key);
      setStoredValue(initialValue);
    } catch (err) {
      if (import.meta.env.DEV) {
        console.warn(`[useLocalStorage] Failed to remove ${key}`, err);
      }
    }
  }, [key, initialValue]);

  return [storedValue, setValue, removeValue];
}
