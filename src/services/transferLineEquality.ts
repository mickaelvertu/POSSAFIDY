// Compare persisted line data without depending on Firestore map key order.
// Optional undefined fields are omitted when saving to Firestore.
export function transferLineDataEqual(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right)
      && left.length === right.length
      && left.every((value, index) => transferLineDataEqual(value, right[index]));
  }
  if (!left || !right || typeof left !== "object" || typeof right !== "object") return false;
  const leftMap = left as Record<string, unknown>;
  const rightMap = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftMap).filter(key => leftMap[key] !== undefined);
  const rightKeys = Object.keys(rightMap).filter(key => rightMap[key] !== undefined);
  return leftKeys.length === rightKeys.length
    && leftKeys.every(key => Object.prototype.hasOwnProperty.call(rightMap, key)
      && transferLineDataEqual(leftMap[key], rightMap[key]));
}
