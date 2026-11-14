import type { PosOrderLine } from './posOrderTypes';

export interface RawMaterialOrderLine extends PosOrderLine {
  unit_cost: number;
}

export interface RawMaterialOrder {
  id: string;
  order_number: string;
  store_id: string;
  created_by: string;
  created_by_name: string;
  lines: RawMaterialOrderLine[];
  reviewed_lines: RawMaterialOrderLine[];
  notes: string;
  admin_note: string;
  status: 'PENDING' | 'REJECTED' | 'PURCHASE_CREATED';
  supplier_id: string;
  purchase_id: string;
  reviewed_by: string;
  created_at: number;
  updated_at: number;
}
