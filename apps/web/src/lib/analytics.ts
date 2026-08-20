/**
 * GTM dataLayer helpers.
 *
 * We don't call the Facebook Pixel (`fbq`) directly — the pixel lives inside
 * GTM (container GTM-PFZT6LZS, see app/[locale]/layout.tsx). Instead we push
 * semantic events to `dataLayer` and let GTM triggers map them to pixel events:
 *
 *   sign_up  → CompleteRegistration
 *   purchase → Purchase   (value + currency + transaction_id)
 *
 * Keeping the mapping in GTM means marketing can re-tag (add Google Ads, TikTok,
 * etc.) without a code change/deploy.
 */

declare global {
  interface Window {
    dataLayer?: Record<string, unknown>[];
  }
}

/** Low-level push. No-op during SSR. */
export function pushDataLayer(event: string, params: Record<string, unknown> = {}): void {
  if (typeof window === 'undefined') return;
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ event, ...params });
}

/** User completed sign-up. Map in GTM → Meta `CompleteRegistration`. */
export function trackSignUp(params: { method?: string } = {}): void {
  pushDataLayer('sign_up', { method: params.method ?? 'password' });
}

export interface PurchaseParams {
  /** Amount in major currency units, e.g. 12.5 for $12.50. */
  value: number;
  /** ISO 4217 code, e.g. 'USD'. */
  currency: string;
  /** Unique order/deposit id — used by Meta for purchase dedup. */
  transactionId: string;
}

/** Payment succeeded. Map in GTM → Meta `Purchase` (with value/currency). */
export function trackPurchase({ value, currency, transactionId }: PurchaseParams): void {
  pushDataLayer('purchase', {
    value,
    currency,
    transaction_id: transactionId,
  });
}

/** User started a checkout/top-up. Map in GTM → Meta `InitiateCheckout`. */
export function trackInitiateCheckout(params: { value?: number; currency?: string } = {}): void {
  pushDataLayer('initiate_checkout', {
    value: params.value,
    currency: params.currency ?? 'USD',
  });
}
