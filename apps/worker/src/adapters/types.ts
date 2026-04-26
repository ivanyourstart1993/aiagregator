// Worker-side mirror of the provider adapter contract used by the API.
// Kept intentionally narrow — only what the worker needs at runtime.

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
  ) {
    super(message);
    this.name = 'AdapterError';
  }
}

export interface ProviderAdapter {
  readonly providerCode: string;
  supports(modelCode: string, methodCode: string): boolean;
  execute(ctx: AdapterContext): Promise<AdapterResult>;
  /**
   * Optional poll for long-running operations. Worker submits the initial
   * request via `execute` (which returns `{ pending: true, providerJobId }`),
   * and the API-side cron polls progress via this method.
   */
  pollOperation?(
    ctx: AdapterContext,
    operationName: string,
  ): Promise<AdapterResult>;
}
