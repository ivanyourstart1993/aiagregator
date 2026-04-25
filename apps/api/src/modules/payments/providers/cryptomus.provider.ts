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
import {
  buildCryptomusSignature,
  verifyCryptomusSignature,
} from './cryptomus.signature';

interface CryptomusInvoiceBody {
  amount: string;
  currency: string;
  order_id: string;
  url_callback: string;
  url_return?: string;
  lifetime?: number;
}

interface CryptomusInvoiceResponse {
  state?: number;
  result?: {
    uuid: string;
    order_id: string;
    amount: string;
    payment_amount?: string;
    payer_amount?: string;
    payer_currency?: string;
    address?: string;
    network?: string;
    url: string;
    expired_at?: number;
    status?: string;
  };
  message?: string;
}

interface CryptomusWebhookPayload {
  uuid?: string;
  order_id?: string;
  status?: string;
  amount?: string;
  payer_amount?: string;
  payer_currency?: string;
  txid?: string;
  is_final?: boolean;
  sign?: string;
  [k: string]: unknown;
}

@Injectable()
export class CryptomusProvider implements PaymentProvider {
  readonly slug = PaymentProviderEnum.CRYPTOMUS;
  private readonly logger = new Logger(CryptomusProvider.name);
  private readonly apiBase: string;
  private readonly merchantId: string;
  private readonly apiKey: string;

  constructor(config: ConfigService) {
    this.apiBase = config.get<string>('CRYPTOMUS_API_BASE') ?? 'https://api.cryptomus.com/v1';
    this.merchantId = config.get<string>('CRYPTOMUS_MERCHANT_ID') ?? '';
    this.apiKey = config.get<string>('CRYPTOMUS_API_KEY') ?? '';
  }

  async createInvoice(params: CreateInvoiceParams): Promise<CreateInvoiceResult> {
    if (!this.merchantId || !this.apiKey) {
      throw new Error(
        'Cryptomus is not configured: missing CRYPTOMUS_MERCHANT_ID or CRYPTOMUS_API_KEY',
      );
    }
    const body: CryptomusInvoiceBody = {
      amount: params.amountUSD,
      currency: 'USD',
      order_id: params.orderId,
      url_callback: params.callbackUrl,
      lifetime: params.lifetimeSeconds ?? 7200,
    };
    if (params.returnUrl) body.url_return = params.returnUrl;

    const sign = buildCryptomusSignature(body, this.apiKey);
    const url = `${this.apiBase.replace(/\/$/, '')}/payment`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        merchant: this.merchantId,
        sign,
      },
      body: JSON.stringify(body),
    });

    const text = await res.text();
    let parsed: CryptomusInvoiceResponse | null = null;
    try {
      parsed = text ? (JSON.parse(text) as CryptomusInvoiceResponse) : null;
    } catch {
      // fall through
    }

    if (!res.ok || !parsed?.result) {
      const message = parsed?.message ?? `HTTP ${res.status}`;
      this.logger.error(
        `Cryptomus createInvoice failed: ${message}; raw=${text.slice(0, 500)}`,
      );
      throw new Error(`Cryptomus createInvoice failed: ${message}`);
    }

    const expiresAt =
      parsed.result.expired_at && Number.isFinite(parsed.result.expired_at)
        ? new Date(parsed.result.expired_at * 1000)
        : null;

    return {
      externalInvoiceId: parsed.result.uuid,
      payUrl: parsed.result.url,
      expiresAt,
      raw: parsed,
    };
  }

  verifyWebhook(rawBody: string, _headers: Record<string, string>): WebhookVerification {
    let parsed: CryptomusWebhookPayload;
    try {
      parsed = JSON.parse(rawBody) as CryptomusWebhookPayload;
    } catch {
      return { ok: false, reason: 'invalid_json' };
    }
    const { sign, ...withoutSign } = parsed;
    if (!sign || typeof sign !== 'string') {
      return { ok: false, reason: 'missing_sign' };
    }
    if (!this.apiKey) {
      return { ok: false, reason: 'provider_not_configured' };
    }
    const ok = verifyCryptomusSignature(withoutSign, sign, this.apiKey);
    if (!ok) return { ok: false, reason: 'bad_signature' };
    return { ok: true, payload: withoutSign };
  }

  parseWebhook(payload: Record<string, unknown>): NormalisedWebhook {
    const p = payload as CryptomusWebhookPayload;
    if (!p.uuid || !p.order_id) {
      throw new Error('Cryptomus webhook: missing uuid/order_id');
    }
    return {
      externalInvoiceId: p.uuid,
      externalOrderId: p.order_id,
      status: this.mapStatus(p.status),
      paidAmount: p.payer_amount ?? p.amount,
      paidCurrency: p.payer_currency,
      txid: p.txid,
      paidAt: this.mapStatus(p.status) === 'paid' ? new Date() : undefined,
      raw: payload,
    };
  }

  private mapStatus(s?: string): WebhookStatus {
    switch ((s ?? '').toLowerCase()) {
      case 'paid':
      case 'paid_over':
        return 'paid';
      case 'fail':
      case 'wrong_amount':
        return 'fail';
      case 'cancel':
      case 'system_fail':
        return 'cancel';
      case 'process':
      case 'check':
      case 'confirm_check':
        return 'pending';
      case 'refund_paid':
      case 'refund_process':
      case 'refund_fail':
        return 'cancel';
      default:
        // Cryptomus has 'expired' status documented but it's not always returned;
        // callers can treat 'expired' separately if encountered.
        if ((s ?? '').toLowerCase().includes('expir')) return 'expired';
        return 'pending';
    }
  }
}
