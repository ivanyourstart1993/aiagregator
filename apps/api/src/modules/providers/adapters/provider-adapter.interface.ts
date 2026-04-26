/**
 * Provider adapter contract. Each adapter wraps a single external provider's
 * API (Google Banana, Veo, Kling, etc.) behind a uniform interface so the
 * worker can dispatch tasks without knowing provider specifics.
 *
 * Adapters live in `apps/api/src/modules/providers/adapters/` so that the API
 * process can validate parameter shapes and the worker process can re-import
 * the same code (TypeScript path aliases via tsconfig allow this).
 */

export type AdapterFileType = 'image' | 'video' | 'audio' | 'json';

export interface AdapterFile {
  url: string;
  mimeType: string;
  bucket: string;
  key: string;
  size: number;
  fileType: AdapterFileType;
  width?: number;
  height?: number;
  durationSeconds?: number;
}

export interface AdapterContext {
  taskId: string;
  apiRequestId: string;
  userId: string;
  provider: { id: string; code: string };
  model: { id: string; code: string };
  method: { id: string; code: string };
  params: Record<string, unknown>;
  account: { id: string; credentials: Record<string, unknown> };
  proxy?: {
    host: string;
    port: number;
    protocol: 'HTTP' | 'HTTPS' | 'SOCKS5';
    login?: string;
    password?: string;
  };
}

export interface AdapterResult {
  files?: AdapterFile[];
  providerJobId?: string;
  pending?: boolean;
  providerCostUnits?: bigint;
  meta?: Record<string, unknown>;
}

export type AdapterErrorKind =
  | 'billing'
  | 'quota'
  | 'invalid_credentials'
  | 'rate_limit'
  | 'temporary'
  | 'validation'
  | 'content_rejected'
  | 'unknown';

export class AdapterError extends Error {
  constructor(
    public readonly kind: AdapterErrorKind,
    message: string,
    public readonly retryAfterMs?: number,
    public override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'AdapterError';
  }
}

export interface ProviderAdapter {
  readonly providerCode: string;
  supports(modelCode: string, methodCode: string): boolean;
  execute(ctx: AdapterContext): Promise<AdapterResult>;
}
