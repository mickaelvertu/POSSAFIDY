import { useCallback, useState, type SetStateAction } from "react";

/** A realtime snapshot can arrive before the matching transaction promise resolves. */
export function useRecordState<T extends { id: string }>() {
  const [rows, setRows] = useState<T[]>([]);
  const update = useCallback((value: SetStateAction<T[]>) => {
    setRows(previous => {
      const next = typeof value === "function" ? value(previous) : value;
      const seen = new Set<string>();
      return next.filter(row => {
        if (seen.has(row.id)) return false;
        seen.add(row.id); return true;
      });
    });
  }, []);
  return [rows, update] as const;
}
