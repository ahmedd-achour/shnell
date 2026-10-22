/**
 * Driver wallet: wallets/{uid} = { balances: { TND: -25, DZD: 50000 } } —
 * the ONLY place money lives (users/{uid} carries none). One balance per
 * currency, never converted; written by the server only (processTripEnd,
 * adminAdjustBalance). A driver works in a currency only while that
 * currency's balance is at or above its pause line, so a recharge must name
 * its currency. Same rule as the client repo's functions/lib/wallet.js.
 */
export interface WalletLike {
  balances?: Record<string, number> | null;
}

/** Offered first in the recharge selector; any ISO 4217 code is accepted. */
export const WALLET_CURRENCIES: string[] = [
  'TND', 'DZD', 'MAD', 'LYD', 'EGP', 'MRU', 'XOF', 'XAF',
  'EUR', 'USD', 'GBP', 'CHF', 'CAD', 'SAR', 'AED', 'QAR', 'KWD', 'TRY'
];

/** Every currency the wallet holds, lowest (most urgent) first. */
export function walletBalances(wallet: WalletLike | null | undefined): { currency: string; amount: number }[] {
  return Object.entries(wallet?.balances || {})
    .filter(([, v]) => typeof v === 'number' && isFinite(v))
    .map(([currency, amount]) => ({ currency, amount }))
    .sort((a, b) => a.amount - b.amount);
}

/** Balance of the wallet in one currency (0 when it holds none). */
export function walletBalanceIn(wallet: WalletLike | null | undefined, currency: string): number {
  const v = wallet?.balances?.[currency];
  return typeof v === 'number' && isFinite(v) ? v : 0;
}

/**
 * HTML of the recharge confirmation: who, how much, WHICH currency, and
 * that currency's balance before -> after. Money in the wrong currency is
 * the costly mistake here (a DZD credit never covers a TND debt).
 */
export function rechargeConfirmHtml(name: string, wallet: WalletLike | null | undefined, amount: number, currency: string): string {
  const esc = (t: string) => t.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
  const before = walletBalanceIn(wallet, currency);
  const after = Math.round((before + amount) * 100) / 100;
  return `<div style="text-align:left">
    <div>Compte : <b>${esc(name || '—')}</b></div>
    <div style="font-size:1.6em;margin:.4em 0"><b>+${amount.toFixed(2)} ${esc(currency)}</b></div>
    <div>Solde ${esc(currency)} : ${before.toFixed(2)} → <b>${after.toFixed(2)} ${esc(currency)}</b></div>
    <div style="opacity:.75;margin-top:.5em">Chaque devise est un solde séparé : ce crédit ne couvre aucune autre devise.</div>
  </div>`;
}

/** Toast text for a recharge answer (applied, or waiting for approval). */
export function rechargeResultText(amount: number, res: { pending: boolean; currencyCode: string; newBalance?: number }): string {
  return res.pending
    ? `${amount} ${res.currencyCode} : au-dessus du seuil, en attente de validation par un autre admin.`
    : `+${amount} ${res.currencyCode} crédités. Nouveau solde ${res.currencyCode} : ${(res.newBalance ?? 0).toFixed(2)}`;
}

/** Office receipt number: 2-64 chars, letters/digits and . _ / - */
export function validReceiptRef(ref: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9 ._\/-]{1,63}$/.test((ref || '').trim());
}

/** Selector list: the wallet's own currencies first, then the usual ones. */
export function rechargeCurrencies(wallet: WalletLike | null | undefined): string[] {
  const held = walletBalances(wallet).map(b => b.currency);
  return [...held, ...WALLET_CURRENCIES.filter(c => !held.includes(c))];
}
