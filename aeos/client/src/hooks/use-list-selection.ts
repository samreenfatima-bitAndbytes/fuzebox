import { useCallback, useMemo, useState } from "react";

type UseListSelectionOptions<T> = {
  /** When nothing is selected (or selection left the list), pick this row first. */
  prefer?: (item: T) => boolean;
};

/**
 * Master-detail selection: always resolves a row from the current list (no stale objects),
 * and defaults to the first list entry on first paint when data is available.
 */
export function useListSelection<T>(
  list: T[],
  getId: (item: T) => string | number,
  options?: UseListSelectionOptions<T>,
) {
  const [selectedId, setSelectedId] = useState<string | number | null>(null);

  const selected = useMemo(() => {
    if (list.length === 0) return null;
    if (selectedId != null) {
      const match = list.find((item) => getId(item) === selectedId);
      if (match) return match;
    }
    if (options?.prefer) {
      const preferred = list.find(options.prefer);
      if (preferred) return preferred;
    }
    return list[0] ?? null;
  }, [list, selectedId, options?.prefer]);

  const select = useCallback((item: T) => setSelectedId(getId(item)), [getId]);

  const clear = useCallback(() => setSelectedId(null), []);

  const id = selected != null ? getId(selected) : null;

  return { selected, select, clear, id };
}
