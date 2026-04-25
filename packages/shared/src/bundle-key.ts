import { createHash } from 'node:crypto';

export interface BundleSpec {
  providerSlug: string;
  modelSlug: string;
  method: string;
  mode?: string | null;
  resolution?: string | null;
  durationSeconds?: number | null;
  aspectRatio?: string | null;
}

/**
 * Каноничный ключ связки. Используется как Bundle.bundleKey, denormalised в
 * Transaction.bundleKey/Reservation.bundleKey, как Redis cache key для PricingService
 * и эхо-поле в публичном API. Полная реализация в Этапе 3 (canonicalJson, нормализация).
 */
export function buildBundleKey(spec: BundleSpec): string {
  const normalised = {
    provider: spec.providerSlug.toLowerCase().trim(),
    model: spec.modelSlug.toLowerCase().trim(),
    method: spec.method,
    mode: spec.mode ?? null,
    resolution: spec.resolution ?? null,
    durationSeconds: spec.durationSeconds ?? null,
    aspectRatio: spec.aspectRatio ?? null,
  };
  const canonical = JSON.stringify(normalised, Object.keys(normalised).sort());
  return createHash('sha256').update(canonical).digest('hex');
}
