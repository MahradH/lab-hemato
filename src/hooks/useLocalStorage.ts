import { useCallback, useState } from "react";

type SetValue<T> = (value: T | ((previous: T) => T)) => void;

export function useLocalStorage<T>(key: string, initialValue: T): [T, SetValue<T>] {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = window.localStorage.getItem(key);
      if (stored === null) return initialValue;
      return JSON.parse(stored) as T;
    } catch {
      return initialValue;
    }
  });

  const setStoredValue = useCallback<SetValue<T>>(
    (next) => {
      setValue((previous) => {
        const resolved =
          typeof next === "function" ? (next as (value: T) => T)(previous) : next;
        try {
          window.localStorage.setItem(key, JSON.stringify(resolved));
        } catch {
          // Storage can be unavailable (private mode, quota). State still works.
        }
        return resolved;
      });
    },
    [key],
  );

  return [value, setStoredValue];
}
