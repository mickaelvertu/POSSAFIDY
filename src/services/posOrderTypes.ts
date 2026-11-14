export interface PosOrderLine {
  article_id: string;
  article_code: string;
  article_name: string;
  unit: string;
  quantity: number;
}
export interface PosOrder {
  id: string;
  order_number: string;
  store_id: string;
  created_by: string;
  created_by_name: string;
  lines: PosOrderLine[];
  reviewed_lines: PosOrderLine[];
  notes: string;
  admin_note: string;
  status: 'PENDING' | 'REJECTED' | 'TRANSFER_CREATED';
  source_store_id: string;
  transfer_id: string;
  reviewed_by: string;
  created_at: number;
  updated_at: number;
}
