import type { PaymentProvider as PaymentProviderEnum } from '@aiagg/db';

export type PaymentProviderSlug = PaymentProviderEnum;

export interface CreateInvoiceParams {
  /** Internal opaque order id (Deposit.externalOrderId). */
  orderId: string;
  /** Amount in USD as a string with up to 8 decimals (e.g. "25.00"). */
  amountUSD: string;
  /** Webhook delivery URL (HTTPS in production). */
  callbackUrl: string;
  /** Browser redirect URL after payment. */
  returnUrl?: string;
  /** Optional invoice lifetime in seconds (default 7200). */
  lifetimeSeconds?: number;
}

export interface CreateInvoiceResult {
  externalInvoiceId: string;
  payUrl: string;
  expiresAt: Date | null;
  /** Provider-native payload as returned by createInvoice (for audit). */
  raw: unknown;
}

export type WebhookStatus = 'paid' | 'pending' | 'fail' | 'expired' | 'cancel';

export interface NormalisedWebhook {
  externalInvoiceId: string;
  externalOrderId: string;
  status: WebhookStatus;
  paidAmount?: string;
  paidCurrency?: string;
  txid?: string;
  paidAt?: Date;
  raw: unknown;
}

export interface WebhookVerification {
  ok: boolean;
  reason?: string;
  /** Parsed body (without `sign`) if signature was valid. */
  payload?: Record<string, unknown>;
}

export interface PaymentProvider {
  readonly slug: PaymentProviderSlug;
  createInvoice(params: CreateInvoiceParams): Promise<CreateInvoiceResult>;
  verifyWebhook(rawBody: string, headers: Record<string, string>): WebhookVerification;
  parseWebhook(payload: Record<string, unknown>): NormalisedWebhook;
}
