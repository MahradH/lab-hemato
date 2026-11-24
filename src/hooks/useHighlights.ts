import { useCallback, useMemo } from "react";
import { useLocalStorage } from "./useLocalStorage";

const STORAGE_KEY = "hemato.highlights.v1";

export function useHighlights() {
  const [ids, setIds] = useLocalStorage<string[]>(STORAGE_KEY, []);
  const highlighted = useMemo(() => new Set(ids), [ids]);

  const toggle = useCallback(
    (id: string) => {
      setIds((previous) =>
        previous.includes(id)
          ? previous.filter((item) => item !== id)
          : [...previous, id],
      );
    },
    [setIds],
  );

  return { highlighted, toggle, count: ids.length };
}
