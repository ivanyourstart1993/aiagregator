import { Injectable } from '@nestjs/common';
import type { ProviderAdapter } from './provider-adapter.interface';
import { GoogleBananaAdapter } from './google-banana.adapter';

@Injectable()
export class AdapterRegistry {
  private readonly adapters: ProviderAdapter[];

  constructor(googleBanana: GoogleBananaAdapter) {
    this.adapters = [googleBanana];
  }

  find(
    providerCode: string,
    modelCode: string,
    methodCode: string,
  ): ProviderAdapter | undefined {
    return this.adapters.find(
      (a) => a.providerCode === providerCode && a.supports(modelCode, methodCode),
    );
  }

  list(): ProviderAdapter[] {
    return [...this.adapters];
  }
}
