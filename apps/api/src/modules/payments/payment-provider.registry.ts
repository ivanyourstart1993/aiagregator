import { Injectable } from '@nestjs/common';
import { PaymentProvider as PaymentProviderEnum } from '@aiagg/db';
import type { PaymentProvider, PaymentProviderSlug } from './payment-provider.interface';
import { CryptomusProvider } from './providers/cryptomus.provider';
import { OxapayProvider } from './providers/oxapay.provider';

@Injectable()
export class PaymentProviderRegistry {
  private readonly providers: Map<PaymentProviderSlug, PaymentProvider>;

  constructor(cryptomus: CryptomusProvider, oxapay: OxapayProvider) {
    this.providers = new Map<PaymentProviderSlug, PaymentProvider>([
      [PaymentProviderEnum.CRYPTOMUS, cryptomus],
      [PaymentProviderEnum.OXAPAY, oxapay],
    ]);
  }

  get(slug: PaymentProviderSlug): PaymentProvider {
    const p = this.providers.get(slug);
    if (!p) throw new Error(`Unknown payment provider: ${slug}`);
    return p;
  }

  has(slug: PaymentProviderSlug): boolean {
    return this.providers.has(slug);
  }
}
