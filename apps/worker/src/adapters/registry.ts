import type { ProviderAdapter } from './types';
import { GoogleBananaAdapter } from './google-banana';
import { GoogleVeoAdapter } from './google-veo';
import { KlingAiAdapter } from './kling-ai';
import { SeedanceAdapter } from './seedance';
import type { WorkerStorage } from '../storage/storage';

export class WorkerAdapterRegistry {
  private readonly adapters: ProviderAdapter[];

  constructor(storage: WorkerStorage) {
    this.adapters = [
      new GoogleBananaAdapter(storage),
      new GoogleVeoAdapter(storage),
      new KlingAiAdapter(storage),
      new SeedanceAdapter(storage),
    ];
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
}
