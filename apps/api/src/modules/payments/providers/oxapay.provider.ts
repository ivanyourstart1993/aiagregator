import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentProvider as PaymentProviderEnum } from '@aiagg/db';
import type {
  CreateInvoiceParams,
  CreateInvoiceResult,
  NormalisedWebhook,
  PaymentProvider,
  WebhookStatus,
  WebhookVerification,
} from '../payment-provider.interface';
import { verifyOxapaySignature } from './oxapay.signature';

/**
 * OxaPay merchant integration.
 *
 * API ref: https://docs.oxapay.com/api-reference/merchants
 *
 * - Single API key (Merchant Key) used for both invoice creation and webhook
 *   HMAC verification.
 * - Invoice creation: POST {apiBase}/merchants/request with JSON body containing
 *   the merchant key inline.
 * - Webhook signature: header `hmac` = HMAC-SHA512(rawBody, merchantKey).
 */

interface OxapayInvoiceBody {
  merchant: string;
  amount: number;
  currency?: string;
  lifeTime?: number;
  feePaidByPayer?: 0 | 1;
  underPaidCover?: number;
  callbackUrl?: string;
  returnUrl?: string;
  description?: string;
  orderId?: string;
  email?: string;
}

interface OxapayInvoiceResponse {
  result?: number;
  message?: string;
  trackId?: number | string;
  payLink?: string;
  expiredAt?: number;
}

interface OxapayWebhookPayload {
  type?: string;
  trackId?: number | string;
  status?: string;
  amount?: string | number;
  currency?: string;
  email?: string;
  description?: string;
  orderId?: string;
  txID?: string;
  receivedAmount?: string | number;
  payAmount?: string | number;
  payCurrency?: string;
  network?: string;
  date?: number;
  [k: string]: unknown;
}

@Injectable()
export class OxapayProvider implements PaymentProvider {
  readonly slug = PaymentProviderEnum.OXAPAY;
  private readonly logger = new Logger(OxapayProvider.name);
  private readonly apiBase: string;
  private readonly merchantKey: string;
  private readonly defaultLifetimeMinutes: number;
  private readonly underPaidCover: number;
  private readonly feePaidByPayer: 0 | 1;

  constructor(config: ConfigService) {
    this.apiBase =
      config.get<string>('OXAPAY_API_BASE') ?? 'https://api.oxapay.com';
    this.merchantKey = config.get<string>('OXAPAY_MERCHANT_KEY') ?? '';
    this.defaultLifetimeMinutes = Number(
      config.get<string>('OXAPAY_DEFAULT_LIFETIME_MIN') ?? 60,
    );
    this.underPaidCover = Number(
      config.get<string>('OXAPAY_UNDERPAID_COVER') ?? 5,
    );
    this.feePaidByPayer =
      (config.get<string>('OXAPAY_FEE_PAID_BY_PAYER') ?? 'true').toLowerCase() ===
      'true'
        ? 1
        : 0;
  }

  async createInvoice(params: CreateInvoiceParams): Promise<CreateInvoiceResult> {
    if (!this.merchantKey) {
      throw new Error('OxaPay is not configured: missing OXAPAY_MERCHANT_KEY');
    }

    const lifetimeMinutes = params.lifetimeSeconds
      ? Math.max(15, Math.min(2880, Math.round(params.lifetimeSeconds / 60)))
      : this.defaultLifetimeMinutes;

    const body: OxapayInvoiceBody = {
      merchant: this.merchantKey,
      amount: Number(params.amountUSD),
      currency: 'USD',
      lifeTime: lifetimeMinutes,
      feePaidByPayer: this.feePaidByPayer,
      underPaidCover: this.underPaidCover,
      callbackUrl: params.callbackUrl,
      orderId: params.orderId,
      description: 'Top up balance',
    };
    if (params.returnUrl) body.returnUrl = params.returnUrl;

    const url = `${this.apiBase.replace(/\/$/, '')}/merchants/request`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const text = await res.text();
    let parsed: OxapayInvoiceResponse | null = null;
    try {
      parsed = text ? (JSON.parse(text) as OxapayInvoiceResponse) : null;
    } catch {
      // fall through
    }

    // OxaPay returns result=100 on success; everything else is an error.
    if (
      !res.ok ||
      !parsed ||
      parsed.result !== 100 ||
      !parsed.payLink ||
      parsed.trackId === undefined
    ) {
      const message = parsed?.message ?? `HTTP ${res.status}`;
      this.logger.error(
        `OxaPay createInvoice failed: ${message}; raw=${text.slice(0, 500)}`,
      );
      throw new Error(`OxaPay createInvoice failed: ${message}`);
    }

    const expiresAt =
      parsed.expiredAt && Number.isFinite(parsed.expiredAt)
        ? new Date(parsed.expiredAt * 1000)
        : new Date(Date.now() + lifetimeMinutes * 60_000);

    return {
      externalInvoiceId: String(parsed.trackId),
      payUrl: parsed.payLink,
      expiresAt,
      raw: parsed,
    };
  }

  verifyWebhook(rawBody: string, headers: Record<string, string>): WebhookVerification {
    if (!this.merchantKey) {
      return { ok: false, reason: 'provider_not_configured' };
    }
    const sign = headers['hmac'] ?? headers['HMAC'] ?? '';
    if (!sign) return { ok: false, reason: 'missing_hmac_header' };

    const ok = verifyOxapaySignature(rawBody, sign, this.merchantKey);
    if (!ok) return { ok: false, reason: 'bad_signature' };

    let parsed: OxapayWebhookPayload;
    try {
      parsed = JSON.parse(rawBody) as OxapayWebhookPayload;
    } catch {
      return { ok: false, reason: 'invalid_json' };
    }
    return { ok: true, payload: parsed };
  }

  parseWebhook(payload: Record<string, unknown>): NormalisedWebhook {
    const p = payload as OxapayWebhookPayload;
    if (p.trackId === undefined || p.trackId === null) {
      throw new Error('OxaPay webhook: missing trackId');
    }
    if (!p.orderId) {
      throw new Error('OxaPay webhook: missing orderId');
    }
    const status = this.mapStatus(p.status);
    return {
      externalInvoiceId: String(p.trackId),
      externalOrderId: p.orderId,
      status,
      paidAmount:
        p.receivedAmount !== undefined
          ? String(p.receivedAmount)
          : p.payAmount !== undefined
            ? String(p.payAmount)
            : p.amount !== undefined
              ? String(p.amount)
              : undefined,
      paidCurrency: p.payCurrency ?? p.currency,
      txid: p.txID,
      paidAt:
        status === 'paid'
          ? p.date && Number.isFinite(p.date)
            ? new Date(Number(p.date) * 1000)
            : new Date()
          : undefined,
      raw: payload,
    };
  }

  private mapStatus(s?: string): WebhookStatus {
    switch ((s ?? '').toLowerCase()) {
      case 'paid':
      case 'partiallypaid':
        return 'paid';
      case 'waiting':
      case 'confirming':
      case 'new':
        return 'pending';
      case 'expired':
        return 'expired';
      case 'rejected':
      case 'failed':
        return 'fail';
      default:
        return 'pending';
    }
  }
}
