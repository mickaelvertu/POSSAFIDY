import { ReactNode } from "react";
import { formatSignedQuantity, LedgerBlock } from "./stockLedger";
import {
  Article,
  AuditLog,
  Production,
  ReportType,
  Sale,
  StockMovement,
  StockTransfer,
  StockTransferLine,
  StoreStock
} from "../types";

export interface ReportColumn<T = any> {
  key: string;
  label: string;
  align?: "right";
  /** Raw comparable/exportable value (used for sorting and CSV export). */
  value: (row: T) => string | number;
  /** Optional custom cell rendering (defaults to the raw value). */
  render?: (row: T) => ReactNode;
  /** Optional footer aggregation (e.g. totals row). */
  footer?: (rows: T[]) => ReactNode;
}

export interface ReportTableConfig<T = any> {
  columns: ReportColumn<T>[];
  rows: T[];
  rowKey: (row: T, index: number) => string;
}

export interface ReportColumnsContext {
  getStoreName: (id: string) => string;
  getCategoryName: (id: string) => string;
  getArticle: (id: string) => Article | undefined;
  reportStocks: StoreStock[];
  reportMovements: StockMovement[];
  reportLedger: LedgerBlock[];
  reportTransfers: StockTransfer[];
  reportSales: Sale[];
  reportProductions: Production[];
  reportAuditLogs: AuditLog[];
  salesByCustomer: { name: string; count: number; total: number }[];
  salesByArticle: { id: string; name: string; code: string; quantity: number; total: number }[];
  salesByCategory: { id: string; quantity: number; total: number; articleIds: Set<string> }[];
  filteredSalesLines: { quantity: number; total: number }[];
}

const money = (amount: number) => `${Math.round(amount).toLocaleString("fr-FR")} Ar`;
const sum = (values: number[]) => values.reduce((acc, value) => acc + value, 0);

export function getReportTableConfig(reportType: ReportType, ctx: ReportColumnsContext): ReportTableConfig {
  const { getStoreName, getCategoryName, getArticle } = ctx;

  switch (reportType) {
    case "STOCK_STATUS": {
      type Row = { stock: StoreStock; article: Article };
      const rows: Row[] = ctx.reportStocks
        .map(stock => ({ stock, article: getArticle(stock.article_id) as Article }))
        .filter(row => Boolean(row.article));
      const columns: ReportColumn<Row>[] = [
        { key: "store", label: "Magasin", value: r => getStoreName(r.stock.store_id) },
        { key: "code", label: "Réf", value: r => r.article.code },
        { key: "name", label: "Désignation", value: r => r.article.name },
        { key: "type", label: "Type", value: r => r.article.article_type, render: r => (
          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${r.article.article_type === "RESALE" ? "bg-emerald-50 text-emerald-700" : "bg-purple-50 text-purple-700"}`}>
            {r.article.article_type === "RESALE" ? "Revente" : "Mat. Première"}
          </span>
        ) },
        { key: "unit", label: "Unité", value: r => r.article.unit },
        { key: "quantity", label: "Quantité", align: "right", value: r => r.stock.quantity, footer: rows => sum(rows.map(r => r.stock.quantity)) },
        { key: "pu", label: "PU (Normal)", align: "right", value: r => r.article.prix_normal, render: r => `${r.article.prix_normal.toLocaleString("fr-FR")} Ar` },
        { key: "totalValue", label: "Valeur Totale", align: "right", value: r => r.stock.quantity * r.article.prix_normal, render: r => money(r.stock.quantity * r.article.prix_normal), footer: rows => money(sum(rows.map(r => r.stock.quantity * r.article.prix_normal))) }
      ];
      return { columns, rows, rowKey: r => r.stock.id };
    }

    case "STOCK_MOVEMENTS": {
      const rows = ctx.reportMovements;
      const columns: ReportColumn<StockMovement>[] = [
        { key: "date", label: "Date / Heure", value: m => m.created_at, render: m => new Date(m.created_at).toLocaleString("fr-FR") },
        { key: "store", label: "Magasin", value: m => getStoreName(m.store_id) },
        { key: "type", label: "Flux", value: m => m.movement_type },
        { key: "article", label: "Article", value: m => getArticle(m.article_id)?.name || "", render: m => {
          const art = getArticle(m.article_id);
          return <span><span className="font-mono text-slate-500 font-bold">[{art?.code}]</span> {art?.name}</span>;
        } },
        { key: "before", label: "Avant", align: "right", value: m => m.before_quantity },
        { key: "quantity", label: "Mouvement", align: "right", value: m => m.quantity, render: m => (
          <span className={m.quantity > 0 ? "text-emerald-700 font-bold" : "text-rose-700 font-bold"}>{m.quantity > 0 ? `+${m.quantity}` : m.quantity}</span>
        ) },
        { key: "after", label: "Après", align: "right", value: m => m.after_quantity },
        { key: "ref", label: "Réf / Opérateur", value: m => m.reference_number, render: m => <span><span className="font-mono font-semibold">{m.reference_number}</span> ({m.created_by_name})</span> }
      ];
      return { columns, rows, rowKey: m => m.id };
    }

    case "STOCK_LEDGER": {
      type Row = { key: string; article: string; store: string; date: string; label: string; change: number | string; balance: number; reference: string };
      const dateText = (timestamp: number) => new Date(timestamp).toLocaleString("fr-FR");
      const rows: Row[] = ctx.reportLedger.flatMap(block => {
        const base = { article: block.articleName + (block.articleCode ? " [" + block.articleCode + "]" : ""), store: block.storeName };
        return [
          { ...base, key: block.key + "::before", date: dateText(block.firstDate), label: "Stock avant", change: "", balance: block.before, reference: "" },
          ...block.entries.map(entry => ({ ...base, key: entry.id, date: dateText(entry.date), label: entry.cause, change: formatSignedQuantity(entry.change), balance: entry.balanceAfter, reference: entry.reference })),
          { ...base, key: block.key + "::after", date: dateText(block.lastDate), label: "Stock après", change: "", balance: block.after, reference: "" }
        ];
      });
      const columns: ReportColumn<Row>[] = [
        { key: "article", label: "Article", value: r => r.article },
        { key: "store", label: "Magasin", value: r => r.store },
        { key: "date", label: "Date", value: r => r.date },
        { key: "label", label: "Opération", value: r => r.label },
        { key: "change", label: "Variation", align: "right", value: r => r.change },
        { key: "balance", label: "Stock", align: "right", value: r => r.balance },
        { key: "ref", label: "Référence", value: r => r.reference }
      ];
      return { columns, rows, rowKey: r => r.key };
    }

    case "TRANSFERS": {
      const rows = ctx.reportTransfers;
      const columns: ReportColumn<StockTransfer>[] = [
        { key: "number", label: "N° Transfert", value: t => t.transfer_number },
        { key: "date", label: "Date", value: t => t.created_at, render: t => new Date(t.created_at).toLocaleDateString("fr-FR") },
        { key: "source", label: "Source", value: t => getStoreName(t.source_store_id) },
        { key: "destination", label: "Destination", value: t => getStoreName(t.destination_store_id) },
        { key: "articles", label: "Articles", value: t => t.lines.map(l => `${l.article_name} (${l.quantity_sent})`).join(", ") },
        { key: "sent", label: "Qté Expédiée", align: "right", value: t => t.lines.reduce((a, l) => a + l.quantity_sent, 0), footer: rows => sum(rows.map(t => t.lines.reduce((a, l) => a + l.quantity_sent, 0))) },
        { key: "accepted", label: "Qté Validée", align: "right", value: t => t.status === "VALIDATED" ? t.lines.reduce((a, l) => a + l.quantity_accepted, 0) : 0, render: t => t.status === "VALIDATED" ? String(t.lines.reduce((a, l) => a + l.quantity_accepted, 0)) : "-" },
        { key: "status", label: "Statut", value: t => t.status, render: t => (
          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
            t.status === "VALIDATED" ? "bg-emerald-100 text-emerald-800" :
            t.status === "IN_TRANSIT" ? "bg-amber-100 text-amber-800" :
            t.status === "DISCREPANCY" ? "bg-rose-100 text-rose-800" : "bg-slate-100 text-slate-800"
          }`}>{t.status}</span>
        ) }
      ];
      return { columns, rows, rowKey: t => t.id };
    }

    case "RECEIPTS":
    case "DISCREPANCIES": {
      type Row = { transfer: StockTransfer; line: StockTransferLine };
      const scoped = ctx.reportTransfers.filter(t => reportType === "DISCREPANCIES"
        ? (t.has_discrepancy || t.status === "DISCREPANCY" || t.lines.some(l => l.quantity_rejected > 0))
        : (t.status === "RECEIVED" || t.status === "VALIDATED"));
      const rows: Row[] = scoped.flatMap(transfer => transfer.lines.map(line => ({ transfer, line })));
      const columns: ReportColumn<Row>[] = [
        { key: "number", label: "N° Transfert", value: r => r.transfer.transfer_number },
        { key: "destination", label: "Site Destinataire", value: r => getStoreName(r.transfer.destination_store_id) },
        { key: "article", label: "Article", value: r => r.line.article_name, render: r => <span><span className="font-mono font-bold text-slate-500">[{r.line.article_code}]</span> {r.line.article_name}</span> },
        { key: "sent", label: "Qté Envoyée", align: "right", value: r => r.line.quantity_sent, footer: rows => sum(rows.map(r => r.line.quantity_sent)) },
        { key: "received", label: "Qté Reçue", align: "right", value: r => r.line.quantity_received, footer: rows => sum(rows.map(r => r.line.quantity_received)) },
        { key: "accepted", label: "Qté Acceptée", align: "right", value: r => r.line.quantity_accepted, footer: rows => sum(rows.map(r => r.line.quantity_accepted)) },
        { key: "rejected", label: "Écart / Rejet", align: "right", value: r => r.line.quantity_rejected, render: r => <span className={r.line.quantity_rejected > 0 ? "text-rose-700 font-bold bg-rose-50" : "text-slate-400"}>{r.line.quantity_rejected}</span>, footer: rows => sum(rows.map(r => r.line.quantity_rejected)) },
        { key: "note", label: "Motif / Commentaire", value: r => r.line.note || r.transfer.discrepancy_resolution_note || "-" }
      ];
      return { columns, rows, rowKey: r => r.line.id };
    }

    case "SALES_BY_CUSTOMER": {
      const rows = ctx.salesByCustomer;
      const columns: ReportColumn<typeof rows[number]>[] = [
        { key: "customer", label: "Client", value: r => r.name || "Client comptoir" },
        { key: "count", label: "Nombre de ventes", align: "right", value: r => r.count, footer: rows => sum(rows.map(r => r.count)) },
        { key: "average", label: "Panier moyen", align: "right", value: r => r.count ? r.total / r.count : 0, render: r => money(r.count ? r.total / r.count : 0) },
        { key: "total", label: "Chiffre d'affaires", align: "right", value: r => r.total, render: r => money(r.total), footer: rows => money(sum(rows.map(r => r.total))) }
      ];
      return { columns, rows, rowKey: (r, i) => `${r.name}-${i}` };
    }

    case "SALES_BY_ARTICLE": {
      const rows = ctx.salesByArticle;
      const columns: ReportColumn<typeof rows[number]>[] = [
        { key: "code", label: "Référence", value: r => r.code },
        { key: "name", label: "Article", value: r => r.name },
        { key: "unit", label: "Unité", value: r => getArticle(r.id)?.unit || "-" },
        { key: "quantity", label: "Quantité vendue", align: "right", value: r => r.quantity, footer: rows => sum(rows.map(r => r.quantity)) },
        { key: "total", label: "Chiffre d'affaires", align: "right", value: r => r.total, render: r => money(r.total), footer: rows => money(sum(rows.map(r => r.total))) }
      ];
      return { columns, rows, rowKey: r => r.id };
    }

    case "SALES_BY_CATEGORY": {
      const rows = ctx.salesByCategory;
      const columns: ReportColumn<typeof rows[number]>[] = [
        { key: "category", label: "Catégorie", value: r => getCategoryName(r.id) },
        { key: "articles", label: "Articles vendus", align: "right", value: r => r.articleIds.size },
        { key: "quantity", label: "Quantité vendue", align: "right", value: r => r.quantity, footer: rows => sum(rows.map(r => r.quantity)) },
        { key: "total", label: "Chiffre d'affaires", align: "right", value: r => r.total, render: r => money(r.total), footer: rows => money(sum(rows.map(r => r.total))) }
      ];
      return { columns, rows, rowKey: r => r.id };
    }

    case "SALES": {
      const rows = ctx.reportSales;
      const columns: ReportColumn<Sale>[] = [
        { key: "number", label: "N° Vente", value: s => s.sale_number },
        { key: "date", label: "Date", value: s => s.created_at, render: s => new Date(s.created_at).toLocaleDateString("fr-FR") },
        { key: "store", label: "Point de Vente", value: s => getStoreName(s.store_id) },
        { key: "customer", label: "Client", value: s => s.customer_name },
        { key: "seller", label: "Vendeur", value: s => s.seller_name },
        { key: "payment", label: "Paiement", value: s => s.payment_method },
        { key: "subtotal", label: "Sous-Total", align: "right", value: s => s.subtotal, render: s => `${s.subtotal.toLocaleString("fr-FR")} Ar` },
        { key: "discount", label: "Remise", align: "right", value: s => s.discount, render: s => s.discount > 0 ? `-${s.discount.toLocaleString("fr-FR")} Ar` : "0 Ar" },
        { key: "total", label: "Total Net", align: "right", value: s => s.total, render: s => money(s.total), footer: rows => money(sum(rows.map(s => s.total))) }
      ];
      return { columns, rows, rowKey: s => s.id };
    }

    case "RAW_MATERIAL_CONSUMPTION": {
      type Row = { production: Production; line: Production["consumptions"][number] };
      const rows: Row[] = ctx.reportProductions.flatMap(production => production.consumptions.map(line => ({ production, line })));
      const columns: ReportColumn<Row>[] = [
        { key: "number", label: "Ordre", value: r => r.production.production_number },
        { key: "date", label: "Date", value: r => r.production.created_at, render: r => new Date(r.production.created_at).toLocaleDateString("fr-FR") },
        { key: "store", label: "Atelier", value: r => getStoreName(r.production.manufacturer_store_id) },
        { key: "article", label: "Matière première", value: r => `${r.line.article_code} ${r.line.article_name}` },
        { key: "quantity", label: "Quantité consommée", align: "right", value: r => r.line.quantity, render: r => `${r.line.quantity} ${r.line.unit}`, footer: rows => sum(rows.map(r => r.line.quantity)) },
        { key: "operator", label: "Opérateur", value: r => r.production.created_by_name }
      ];
      return { columns, rows, rowKey: r => r.line.id };
    }

    case "RETURNS": {
      const rows = ctx.reportTransfers.filter(t => t.type === "RETURN");
      const columns: ReportColumn<StockTransfer>[] = [
        { key: "number", label: "N° retour", value: t => t.transfer_number },
        { key: "date", label: "Date", value: t => t.created_at, render: t => new Date(t.created_at).toLocaleDateString("fr-FR") },
        { key: "source", label: "Source", value: t => getStoreName(t.source_store_id) },
        { key: "destination", label: "Dépôt destinataire", value: t => getStoreName(t.destination_store_id) },
        { key: "articles", label: "Articles retournés", value: t => t.lines.map(l => `${l.article_name} : ${l.quantity_sent} ${l.unit}`).join(" · ") },
        { key: "status", label: "Statut", value: t => t.status }
      ];
      return { columns, rows, rowKey: t => t.id };
    }

    case "PRODUCTION": {
      const rows = ctx.reportProductions;
      const columns: ReportColumn<Production>[] = [
        { key: "number", label: "N° Ordre Fab", value: p => p.production_number },
        { key: "date", label: "Date Réalisation", value: p => p.created_at, render: p => new Date(p.created_at).toLocaleDateString("fr-FR") },
        { key: "store", label: "Atelier", value: p => getStoreName(p.manufacturer_store_id) },
        { key: "consumptions", label: "Matières Consommées", value: p => p.consumptions.map(c => `${c.article_name}: ${c.quantity} ${c.unit}`).join(", "), render: p => (
          <ul className="list-disc list-inside text-rose-700 font-medium">
            {p.consumptions.map(c => <li key={c.id}>{c.article_name} : <span className="font-mono font-bold">{c.quantity} {c.unit}</span></li>)}
          </ul>
        ) },
        { key: "outputs", label: "Produits Fabriqués (Sortie)", value: p => p.outputs.map(o => `${o.article_name}: ${o.quantity} ${o.unit}`).join(", "), render: p => (
          <ul className="list-disc list-inside text-emerald-700 font-medium">
            {p.outputs.map(o => <li key={o.id}>{o.article_name} : <span className="font-mono font-bold">{o.quantity} {o.unit}</span></li>)}
          </ul>
        ) },
        { key: "operator", label: "Opérateur / Validation", value: p => `${p.created_by_name} / ${p.validated_by_name || "En attente"}` },
        { key: "status", label: "Statut", value: p => p.status, render: p => <span className="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded text-[10px] font-bold">{p.status}</span> }
      ];
      return { columns, rows, rowKey: p => p.id };
    }

    case "AUDIT_LOG":
    default: {
      const rows = ctx.reportAuditLogs;
      const columns: ReportColumn<AuditLog>[] = [
        { key: "date", label: "Horodatage", value: l => l.created_at, render: l => new Date(l.created_at).toLocaleString("fr-FR") },
        { key: "user", label: "Utilisateur", value: l => l.user_name },
        { key: "action", label: "Action", value: l => l.action },
        { key: "entity", label: "Entité & ID", value: l => `${l.entity_type} (${l.entity_id})`, render: l => <span><span className="font-mono">{l.entity_type}</span> <span className="text-slate-400">({l.entity_id})</span></span> },
        { key: "device", label: "Appareil (Device)", value: l => l.device_id },
        { key: "details", label: "Détails de Sécurité", value: l => JSON.stringify(l.new_value || l.old_value || {}) }
      ];
      return { columns, rows, rowKey: l => l.id };
    }
  }
}

export function sortReportRows<T>(rows: T[], columns: ReportColumn<T>[], sort: { key: string; dir: "asc" | "desc" } | null): T[] {
  if (!sort) return rows;
  const column = columns.find(col => col.key === sort.key);
  if (!column) return rows;
  return [...rows].sort((a, b) => {
    const va = column.value(a);
    const vb = column.value(b);
    const comparison = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb), "fr-FR");
    return sort.dir === "asc" ? comparison : -comparison;
  });
}

function csvCell(value: string | number): string {
  const text = String(value ?? "");
  return /[";\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function downloadReportCsv(filename: string, columns: ReportColumn[], rows: unknown[]): void {
  const lines = [
    columns.map(col => csvCell(col.label)).join(";"),
    ...rows.map(row => columns.map(col => csvCell(col.value(row))).join(";"))
  ];
  const csvContent = "\uFEFF" + lines.join("\r\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
