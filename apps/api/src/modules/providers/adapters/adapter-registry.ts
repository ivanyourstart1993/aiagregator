import { Injectable } from '@nestjs/common';
import type { ProviderAdapter } from './provider-adapter.interface';
import { GoogleBananaAdapter } from './google-banana.adapter';
import { GoogleVeoAdapter } from './google-veo.adapter';
import { KlingAiAdapter } from './kling-ai.adapter';
import { SeedanceAdapter } from './seedance.adapter';
import { OpenAiImageAdapter } from './openai-image.adapter';

@Injectable()
export class AdapterRegistry {
  private readonly adapters: ProviderAdapter[];

  constructor(
    googleBanana: GoogleBananaAdapter,
    googleVeo: GoogleVeoAdapter,
    klingAi: KlingAiAdapter,
    seedance: SeedanceAdapter,
    openaiImage: OpenAiImageAdapter,
  ) {
    this.adapters = [googleBanana, googleVeo, klingAi, seedance, openaiImage];
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
