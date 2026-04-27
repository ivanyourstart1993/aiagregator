import type { AvailabilityScope, CatalogStatus } from '@aiagg/db';

export interface ProviderView {
  id: string;
  code: string;
  publicName: string;
  description: string | null;
  status: CatalogStatus;
  sortOrder: number;
  models?: ModelView[];
}

export interface ModelView {
  id: string;
  providerId: string;
  providerCode: string;
  code: string;
  publicName: string;
  description: string | null;
  status: CatalogStatus;
  sortOrder: number;
}

export interface MethodView {
  id: string;
  providerId: string;
  providerCode: string;
  modelId: string;
  modelCode: string;
  code: string;
  publicName: string;
  description: string | null;
  parametersSchema: Record<string, unknown>;
  exampleRequest: unknown;
  exampleResponse: unknown;
  supportsSync: boolean;
  supportsAsync: boolean;
  availability: AvailabilityScope;
  status: CatalogStatus;
  sortOrder: number;
}

export interface AdminMethodView extends MethodView {
  availabilityUserIds: string[];
}
