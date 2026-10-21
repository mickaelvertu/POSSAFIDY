// Firestore map keys have no meaningful order. Ignore undefined fields just as
// the persistence layer does, but preserve array order and every stored value.
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.filter(item => item !== undefined).map(canonicalize);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)])
    );
  }
  return value;
}

export function transferLinesEqual(left: unknown[], right: unknown[]): boolean {
  return JSON.stringify(canonicalize(left)) === JSON.stringify(canonicalize(right));
}
