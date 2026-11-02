import { useEffect, useState } from "react";

export function useListWindow(filterKey: string, pageSize = 100) {
  const [count, setCount] = useState(pageSize);
  useEffect(() => setCount(pageSize), [filterKey, pageSize]);
  return { count, showMore: () => setCount(value => value + pageSize) };
}
