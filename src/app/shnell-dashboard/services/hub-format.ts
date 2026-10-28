/**
 * Admin hub: one reading of the ledger (commissions/*) and of the audit log
 * (admin_audit/*) for every screen — Finance, Activity, Account 360, the
 * topbar bell. Ledger lines have one shape (functions/lib/ledger.js);
 * normalizeLedger() turns a raw line into a typed LedgerRow.
 */

/** Firestore Timestamp | Date | millis | {seconds} -> millis (0 when unknown). */
export function toMillis(v: any): number {
  if (!v) return 0;
  if (typeof v === 'number') return v;
  if (typeof v.toMillis === 'function') return v.toMillis();
  if (v instanceof Date) return v.getTime();
  if (typeof v.seconds === 'number') return v.seconds * 1000;
  const t = Date.parse(String(v));
  return isNaN(t) ? 0 : t;
}

export type LedgerKind = 'commission' | 'recharge' | 'adjustment' | 'company_tour' | 'biz_subscription' | string;

export interface LedgerRow {
  id: string;
  uid: string;
  kind: LedgerKind;
  /** Signed change of the wallet (+ credit, − debit). */
  delta: number;
  currencyCode: string;
  balanceBefore: number | null;
  balanceAfter: number | null;
  time: number;
  reference: string | null;
  requestId: string | null;
  orderId: string | null;
  dealId: string | null;
  adminUid: string | null;
  approvedBy: string | null;
  reason: string | null;
  /** Trip amount the commission was taken on (commission lines). */
  dealAmount: number | null;
}

const num = (v: any): number | null => (typeof v === 'number' && isFinite(v) ? v : null);

export function normalizeLedger(raw: any): LedgerRow {
  const d = raw || {};
  const kind: LedgerKind = d.kind || 'commission';
  const delta = num(d.delta) ?? 0;
  return {
    id: d.id,
    uid: String(d.uid || ''),
    kind,
    delta: Math.round(delta * 100) / 100,
    currencyCode: d.currencyCode || 'TND',
    balanceBefore: num(d.balanceBefore),
    balanceAfter: num(d.balanceAfter),
    time: toMillis(d.time),
    reference: d.reference || null,
    requestId: d.requestId || null,
    orderId: d.orderId || null,
    dealId: d.dealId || null,
    adminUid: d.adminUid || null,
    approvedBy: d.approvedBy || null,
    reason: d.reason || null,
    dealAmount: num(d.dealAmount),
  };
}

export const LEDGER_KIND_META: Record<string, { label: string; icon: string; tone: string }> = {
  commission:   { label: 'Trip commission', icon: 'bi-percent',            tone: 'info' },
  recharge:     { label: 'Office recharge', icon: 'bi-cash-coin',          tone: 'success' },
  adjustment:   { label: 'Adjustment',      icon: 'bi-sliders',            tone: 'warning' },
  company_tour: { label: 'Partner tour',    icon: 'bi-buildings',          tone: 'info' },
  biz_subscription: { label: 'Business Pro', icon: 'bi-briefcase-fill', tone: 'info' },
};

export function ledgerMeta(kind: string) {
  return LEDGER_KIND_META[kind] || { label: kind, icon: 'bi-receipt', tone: 'info' };
}

/* ------------------------------ audit log ------------------------------ */

export interface AuditRow {
  id: string;
  adminUid: string;
  action: string;
  details: any;
  targetUid: string | null;
  orderId: string | null;
  at: number;
}

export function normalizeAudit(raw: any): AuditRow {
  const d = raw || {};
  const det = d.details || {};
  return {
    id: d.id,
    adminUid: d.adminUid || 'system',
    action: d.action || '?',
    details: det,
    targetUid: d.targetUid || det.userId || det.driverId || null,
    orderId: d.orderId || det.orderId || null,
    at: toMillis(d.at),
  };
}

export type AuditGroup = 'money' | 'account' | 'fleet' | 'orders' | 'comms' | 'system';

export const AUDIT_META: Record<string, { label: string; icon: string; tone: string; group: AuditGroup }> = {
  adjust_balance:      { label: 'Wallet movement',        icon: 'bi-cash-coin',          tone: 'success', group: 'money' },
  recharge_requested:  { label: 'Recharge to approve',    icon: 'bi-hourglass-split',    tone: 'warning', group: 'money' },
  recharge_approved:   { label: 'Recharge approved',      icon: 'bi-check2-circle',      tone: 'success', group: 'money' },
  recharge_rejected:   { label: 'Recharge rejected',      icon: 'bi-x-circle',           tone: 'danger',  group: 'money' },
  recharge_failed:     { label: 'Recharge failed',        icon: 'bi-exclamation-octagon', tone: 'danger', group: 'money' },
  signup_gift_dropped: { label: 'Sign-up gift not carried', icon: 'bi-gift',             tone: 'info',    group: 'money' },
  signup_gift_revoked: { label: 'Sign-up gift removed',   icon: 'bi-gift',               tone: 'warning', group: 'money' },
  ban_user:            { label: 'Account banned',         icon: 'bi-slash-circle',       tone: 'danger',  group: 'account' },
  unban_user:          { label: 'Account unbanned',       icon: 'bi-unlock',             tone: 'success', group: 'account' },
  verify_driver:       { label: 'Driver verified',        icon: 'bi-patch-check',        tone: 'success', group: 'account' },
  unverify_driver:     { label: 'Verification revoked',   icon: 'bi-patch-exclamation',  tone: 'warning', group: 'account' },
  update_account:      { label: 'Account updated',        icon: 'bi-person-gear',        tone: 'info',    group: 'account' },
  issue_api_key:       { label: 'API key issued',         icon: 'bi-key',                tone: 'info',    group: 'account' },
  reset_password:      { label: 'Password reset',         icon: 'bi-shield-lock',        tone: 'warning', group: 'account' },
  approve_vehicle:     { label: 'Vehicle approved',       icon: 'bi-truck',              tone: 'success', group: 'fleet' },
  suspend_vehicle:     { label: 'Vehicle suspended',      icon: 'bi-truck',              tone: 'warning', group: 'fleet' },
  delete_vehicle:      { label: 'Vehicle deleted',        icon: 'bi-trash3',             tone: 'danger',  group: 'fleet' },
  assign_order:        { label: 'Order assigned',         icon: 'bi-send-check',         tone: 'info',    group: 'orders' },
  reassign_order:      { label: 'Order reassigned',       icon: 'bi-arrow-left-right',   tone: 'warning', group: 'orders' },
  cancel_order:        { label: 'Order cancelled',        icon: 'bi-x-octagon',          tone: 'danger',  group: 'orders' },
  redispatch:          { label: 'Dispatch retried',       icon: 'bi-arrow-repeat',       tone: 'info',    group: 'orders' },
  broadcast_topic:     { label: 'Broadcast (topic)',      icon: 'bi-megaphone',          tone: 'info',    group: 'comms' },
  broadcast_users:     { label: 'Broadcast (users)',      icon: 'bi-megaphone',          tone: 'info',    group: 'comms' },
  update_settings:     { label: 'Settings changed',       icon: 'bi-gear',               tone: 'warning', group: 'system' },
};

export function auditMeta(action: string) {
  return AUDIT_META[action] || { label: action.replace(/_/g, ' '), icon: 'bi-journal-text', tone: 'info', group: 'system' as AuditGroup };
}

const money = (n: any, cur?: string) =>
  `${Number(n) > 0 ? '+' : ''}${Number(n || 0).toFixed(2)} ${cur || ''}`.trim();

/** One readable sentence for an audit entry. `name` resolves uids to names. */
export function describeAudit(a: AuditRow, name: (uid: string) => string): string {
  const d = a.details || {};
  const who = a.targetUid ? name(a.targetUid) : '';
  switch (a.action) {
    case 'adjust_balance':
      return `${money(d.amount, d.currencyCode)} on ${who} · receipt ${d.reference || '—'}` +
        (d.approvedBy ? ` · approved by ${name(d.approvedBy)}` : '') +
        (d.newBalance !== undefined ? ` · new balance ${Number(d.newBalance).toFixed(2)} ${d.currencyCode}` : '');
    case 'recharge_requested':
      return `${money(d.amount, d.currencyCode)} for ${who} · receipt ${d.reference} · above the ${d.threshold} ${d.currencyCode} limit`;
    case 'recharge_approved':
    case 'recharge_rejected':
    case 'recharge_failed':
      return `${money(d.amount, d.currencyCode)} for ${who} · receipt ${d.reference} · requested by ${name(d.requestedBy)}` +
        (d.error ? ` · ${d.error}` : '');
    case 'signup_gift_dropped':
    case 'signup_gift_revoked':
      return `${who}: the old ${Math.abs(d.amount || 10)} ${d.currencyCode || 'TND'} sign-up gift — account starts at 0`;
    case 'assign_order':
    case 'reassign_order':
      return `Order ${short(d.orderId)} → ${name(d.driverId)}` + (d.previousDriver ? ` (was ${name(d.previousDriver)})` : '');
    case 'cancel_order':
      return `Order ${short(d.orderId)}` + (d.reason ? ` · ${d.reason}` : '');
    case 'redispatch':
      return `Order ${short(d.orderId)} sent to drivers again`;
    case 'broadcast_topic':
      return `“${d.title}” to topic ${d.topic}`;
    case 'broadcast_users':
      return `“${d.title}” to ${d.count} users (${d.reached ?? '?'} reached)`;
    case 'update_settings':
      return `settings/${d.docId}: ${Object.keys(d.changes || {}).join(', ')}`;
    case 'approve_vehicle':
    case 'suspend_vehicle':
    case 'delete_vehicle':
      return `${d.type || 'Vehicle'} ${d.plate || short(d.vehicleId)} of ${who}`;
    default:
      if (d.changes) return `${who}: ${Object.entries(d.changes).map(([k, v]: any) => `${k} ${fmt(v.from)} → ${fmt(v.to)}`).join(', ')}`;
      return who || JSON.stringify(d).slice(0, 140);
  }
}

function fmt(v: any): string {
  if (v === null || v === undefined) return '∅';
  return typeof v === 'object' ? JSON.stringify(v) : String(v);
}

export function short(id: any): string {
  const s = String(id || '');
  return s.length > 10 ? s.slice(0, 8) + '…' : s || '—';
}

/* ------------------------------ export ------------------------------ */

/** Downloads rows as a UTF-8 CSV (Excel-friendly BOM). */
export function downloadCsv(filename: string, header: string[], rows: (string | number | null | undefined)[][]): void {
  const cell = (v: any) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const body = [header, ...rows].map(r => r.map(cell).join(',')).join('\n');
  const blob = new Blob(['﻿' + body], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** Sums signed deltas per currency. */
export function totalsByCurrency(rows: LedgerRow[]): { currency: string; total: number; count: number }[] {
  const m = new Map<string, { total: number; count: number }>();
  for (const r of rows) {
    const t = m.get(r.currencyCode) || { total: 0, count: 0 };
    t.total = Math.round((t.total + r.delta) * 100) / 100;
    t.count++;
    m.set(r.currencyCode, t);
  }
  return [...m.entries()].map(([currency, t]) => ({ currency, ...t })).sort((a, b) => b.count - a.count);
}
