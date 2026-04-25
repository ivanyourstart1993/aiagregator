import { Injectable } from '@nestjs/common';
import {
  type Bundle,
  BundleUnit,
  type Method,
  type Model,
  type Provider,
} from '@aiagg/db';
import { BundleService } from '../pricing/bundle.service';
import { methodCodeToBundleMethod } from './method-mapping';

const KNOWN_DIM_FIELDS = new Set([
  'mode',
  'resolution',
  'durationSeconds',
  'duration_seconds',
  'aspectRatio',
  'aspect_ratio',
]);

interface SchemaProp {
  'x-bundle-dim'?: boolean;
  type?: string | string[];
}

interface ParametersSchema {
  type?: string;
  properties?: Record<string, SchemaProp>;
  'x-bundle-unit'?: string;
}

interface DimValues {
  mode?: string | null;
  resolution?: string | null;
  durationSeconds?: number | null;
  aspectRatio?: string | null;
}

function pickDimensionsFromSchema(
  schema: ParametersSchema,
  params: Record<string, unknown>,
): DimValues {
  const out: DimValues = {};
  const props = schema.properties ?? {};
  for (const [key, def] of Object.entries(props)) {
    if (!def || def['x-bundle-dim'] !== true) continue;
    if (!KNOWN_DIM_FIELDS.has(key)) continue;
    const raw = params[key];
    if (raw === undefined || raw === null) continue;
    switch (key) {
      case 'mode':
        if (typeof raw === 'string') out.mode = raw;
        break;
      case 'resolution':
        if (typeof raw === 'string') out.resolution = raw;
        break;
      case 'durationSeconds':
      case 'duration_seconds':
        if (typeof raw === 'number' && Number.isFinite(raw)) {
          out.durationSeconds = Math.trunc(raw);
        } else if (typeof raw === 'string' && /^\d+$/.test(raw)) {
          out.durationSeconds = Number.parseInt(raw, 10);
        }
        break;
      case 'aspectRatio':
      case 'aspect_ratio':
        if (typeof raw === 'string') out.aspectRatio = raw;
        break;
    }
  }
  return out;
}

function bundleUnitFromSchema(schema: ParametersSchema): BundleUnit | undefined {
  const raw = schema['x-bundle-unit'];
  if (typeof raw !== 'string') return undefined;
  const allowed = Object.values(BundleUnit) as string[];
  return allowed.includes(raw) ? (raw as BundleUnit) : undefined;
}

@Injectable()
export class BundleSpecService {
  constructor(private readonly bundles: BundleService) {}

  /**
   * Derive a canonical BundleSpec from the method definition and request params,
   * then upsert (idempotent) the corresponding Bundle row.
   */
  async findOrCreateFromRequest(
    methodWithRefs: Method & { provider: Provider; model: Model },
    params: Record<string, unknown>,
    modeFallback?: string,
  ): Promise<Bundle> {
    const schema = (methodWithRefs.parametersSchema ?? {}) as ParametersSchema;
    const dims = pickDimensionsFromSchema(schema, params);
    const unit = bundleUnitFromSchema(schema) ?? BundleUnit.PER_REQUEST;

    return this.bundles.ensureBundle({
      providerSlug: methodWithRefs.provider.code,
      modelSlug: methodWithRefs.model.code,
      method: methodCodeToBundleMethod(methodWithRefs.code),
      mode: dims.mode ?? modeFallback ?? null,
      resolution: dims.resolution ?? null,
      durationSeconds: dims.durationSeconds ?? null,
      aspectRatio: dims.aspectRatio ?? null,
      unit,
    });
  }
}
