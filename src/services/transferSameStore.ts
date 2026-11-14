import type { Store } from '../types';

/** A local return moves ordinary stock into the same depot's quarantine. */
export function permitsSameStoreTransfer(type: string, destination?: Store): boolean {
  return ['DIRECT_DEPOSIT', 'STORE_RETURN'].includes(type)
    && destination?.store_type === 'CENTRAL_WAREHOUSE'
    && destination.is_active;
}
