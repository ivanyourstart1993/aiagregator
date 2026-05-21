import {
  AvailabilityScope,
  BundleMethod,
  BundleUnit,
  CatalogStatus,
  Prisma,
  PrismaClient,
  ProviderAccountStatus,
  UserRole,
  UserStatus,
} from '@prisma/client';
import * as argon2 from 'argon2';
import { createHash } from 'node:crypto';
import { initialCatalog } from './seed/initial-catalog';

const prisma = new PrismaClient();

async function seedSuperAdmin(): Promise<void> {
  const email = (process.env.SEED_SUPERADMIN_EMAIL ?? 'admin@example.com').toLowerCase().trim();
  const password = process.env.SEED_SUPERADMIN_PASSWORD ?? 'change-me-on-first-login';
  const pepper = process.env.API_KEY_PEPPER ?? '';

  const passwordHash = await argon2.hash(password + pepper, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });

  // SEED_RESET_SUPERADMIN_PASSWORD=true → force-rewrite passwordHash on
  // existing super-admin too (idempotent rescue path when the operator
  // forgets the password). Default false: seed never overwrites a
  // human-set password on subsequent runs.
  const forceResetPassword =
    process.env.SEED_RESET_SUPERADMIN_PASSWORD === 'true';

  const user = await prisma.user.upsert({
    where: { email },
    create: {
      email,
      passwordHash,
      name: 'Super Admin',
      role: UserRole.SUPER_ADMIN,
      status: UserStatus.ACTIVE,
      emailVerified: new Date(),
    },
    update: {
      role: UserRole.SUPER_ADMIN,
      status: UserStatus.ACTIVE,
      emailVerified: new Date(),
      ...(forceResetPassword ? { passwordHash } : {}),
    },
  });

  console.log(
    `[seed] super_admin upserted: id=${user.id} email=${user.email}` +
      (forceResetPassword ? ' (password reset from SEED_SUPERADMIN_PASSWORD)' : ''),
  );
}

async function seedCatalog(): Promise<void> {
  let providers = 0;
  let models = 0;
  let methods = 0;
  for (const p of initialCatalog) {
    const provider = await prisma.provider.upsert({
      where: { code: p.code },
      create: {
        code: p.code,
        publicName: p.publicName,
        description: p.description,
        sortOrder: p.sortOrder,
        status: CatalogStatus.ACTIVE,
      },
      update: {
        publicName: p.publicName,
        description: p.description,
        sortOrder: p.sortOrder,
      },
    });
    providers++;

    for (const m of p.models) {
      const model = await prisma.model.upsert({
        where: { providerId_code: { providerId: provider.id, code: m.code } },
        create: {
          providerId: provider.id,
          code: m.code,
          publicName: m.publicName,
          description: m.description ?? null,
          sortOrder: m.sortOrder ?? 0,
          status: CatalogStatus.ACTIVE,
        },
        update: {
          publicName: m.publicName,
          description: m.description ?? null,
          sortOrder: m.sortOrder ?? 0,
        },
      });
      models++;

      for (const meth of m.methods) {
        await prisma.method.upsert({
          where: {
            providerId_modelId_code: {
              providerId: provider.id,
              modelId: model.id,
              code: meth.code,
            },
          },
          create: {
            providerId: provider.id,
            modelId: model.id,
            code: meth.code,
            publicName: meth.publicName,
            description: meth.description,
            parametersSchema: meth.parametersSchema as Prisma.InputJsonValue,
            exampleRequest:
              meth.exampleRequest === undefined
                ? Prisma.JsonNull
                : (meth.exampleRequest as Prisma.InputJsonValue),
            exampleResponse:
              meth.exampleResponse === undefined
                ? Prisma.JsonNull
                : (meth.exampleResponse as Prisma.InputJsonValue),
            supportsSync: meth.supportsSync ?? false,
            supportsAsync: meth.supportsAsync ?? true,
            availability: AvailabilityScope.ALL_USERS,
            status: CatalogStatus.ACTIVE,
            sortOrder: meth.sortOrder ?? 0,
          },
          update: {
            publicName: meth.publicName,
            description: meth.description,
            parametersSchema: meth.parametersSchema as Prisma.InputJsonValue,
            exampleRequest:
              meth.exampleRequest === undefined
                ? Prisma.JsonNull
                : (meth.exampleRequest as Prisma.InputJsonValue),
            exampleResponse:
              meth.exampleResponse === undefined
                ? Prisma.JsonNull
                : (meth.exampleResponse as Prisma.InputJsonValue),
            supportsSync: meth.supportsSync ?? false,
            supportsAsync: meth.supportsAsync ?? true,
            sortOrder: meth.sortOrder ?? 0,
          },
        });
        methods++;
      }
    }
  }
  console.log(
    `[seed] catalog upserted: providers=${providers} models=${models} methods=${methods}`,
  );
}

// ---------------------------------------------------------------------------
// Stage 7 seeds — default tariff, Banana bundle prices, env-based ProviderAccount.
// ---------------------------------------------------------------------------

const CENTS_TO_NANO = 1_000_000n;

interface BananaBundleSpec {
  modelSlug: string;
  methodCode: string;
  resolution: string;
  aspectRatio: string;
  priceCents: number;
}

// Aspect ratios mirror the enum in initial-catalog.ts banana methods.
const BANANA_ASPECT_RATIOS = ['1:1', '3:4', '4:3', '9:16', '16:9'] as const;

// Base prices per TZ §11.1 (price is independent of aspect ratio; we expand
// every entry across all ratios because `aspect_ratio` is a bundle dimension
// and the playground frontend always sends one).
const BANANA_BASE_PRICES: Array<Omit<BananaBundleSpec, 'aspectRatio'>> = [
  // Nano Standard (V1, gemini-2.5-flash-image) — text_to_image only
  { modelSlug: 'gemini-2.5-flash-image',         methodCode: 'text_to_image', resolution: '1K', priceCents: 1.65 },
  // Nano-2 (gemini-3.1-flash-image-preview) — text_to_image
  { modelSlug: 'gemini-3.1-flash-image-preview', methodCode: 'text_to_image', resolution: '0.5K', priceCents: 1.5 },
  { modelSlug: 'gemini-3.1-flash-image-preview', methodCode: 'text_to_image', resolution: '1K',   priceCents: 2 },
  { modelSlug: 'gemini-3.1-flash-image-preview', methodCode: 'text_to_image', resolution: '2K',   priceCents: 2.5 },
  { modelSlug: 'gemini-3.1-flash-image-preview', methodCode: 'text_to_image', resolution: '4K',   priceCents: 4 },
  // Nano-2 — image_edit / image_to_image (t2i × 1.20)
  { modelSlug: 'gemini-3.1-flash-image-preview', methodCode: 'image_edit',     resolution: '0.5K', priceCents: 1.8 },
  { modelSlug: 'gemini-3.1-flash-image-preview', methodCode: 'image_edit',     resolution: '1K',   priceCents: 2.4 },
  { modelSlug: 'gemini-3.1-flash-image-preview', methodCode: 'image_edit',     resolution: '2K',   priceCents: 3 },
  { modelSlug: 'gemini-3.1-flash-image-preview', methodCode: 'image_edit',     resolution: '4K',   priceCents: 4.8 },
  { modelSlug: 'gemini-3.1-flash-image-preview', methodCode: 'image_to_image', resolution: '0.5K', priceCents: 1.8 },
  { modelSlug: 'gemini-3.1-flash-image-preview', methodCode: 'image_to_image', resolution: '1K',   priceCents: 2.4 },
  { modelSlug: 'gemini-3.1-flash-image-preview', methodCode: 'image_to_image', resolution: '2K',   priceCents: 3 },
  { modelSlug: 'gemini-3.1-flash-image-preview', methodCode: 'image_to_image', resolution: '4K',   priceCents: 4.8 },
  // Nano-2 — multi_reference_image (t2i × 1.60)
  { modelSlug: 'gemini-3.1-flash-image-preview', methodCode: 'multi_reference_image', resolution: '1K', priceCents: 3.2 },
  { modelSlug: 'gemini-3.1-flash-image-preview', methodCode: 'multi_reference_image', resolution: '2K', priceCents: 4 },
  { modelSlug: 'gemini-3.1-flash-image-preview', methodCode: 'multi_reference_image', resolution: '4K', priceCents: 6.4 },
  // Pro (gemini-3-pro-image-preview)
  { modelSlug: 'gemini-3-pro-image-preview', methodCode: 'text_to_image', resolution: '1K', priceCents: 3.95 },
  { modelSlug: 'gemini-3-pro-image-preview', methodCode: 'text_to_image', resolution: '2K', priceCents: 4.95 },
  { modelSlug: 'gemini-3-pro-image-preview', methodCode: 'text_to_image', resolution: '4K', priceCents: 7.95 },
  { modelSlug: 'gemini-3-pro-image-preview', methodCode: 'image_edit',     resolution: '1K', priceCents: 4.75 },
  { modelSlug: 'gemini-3-pro-image-preview', methodCode: 'image_edit',     resolution: '2K', priceCents: 5.95 },
  { modelSlug: 'gemini-3-pro-image-preview', methodCode: 'image_edit',     resolution: '4K', priceCents: 9.55 },
  { modelSlug: 'gemini-3-pro-image-preview', methodCode: 'image_to_image', resolution: '1K', priceCents: 4.75 },
  { modelSlug: 'gemini-3-pro-image-preview', methodCode: 'image_to_image', resolution: '2K', priceCents: 5.95 },
  { modelSlug: 'gemini-3-pro-image-preview', methodCode: 'image_to_image', resolution: '4K', priceCents: 9.55 },
  { modelSlug: 'gemini-3-pro-image-preview', methodCode: 'multi_reference_image', resolution: '1K', priceCents: 6.3 },
  { modelSlug: 'gemini-3-pro-image-preview', methodCode: 'multi_reference_image', resolution: '2K', priceCents: 7.95 },
  { modelSlug: 'gemini-3-pro-image-preview', methodCode: 'multi_reference_image', resolution: '4K', priceCents: 12.75 },
];

const BANANA_PRICES: BananaBundleSpec[] = BANANA_BASE_PRICES.flatMap((p) =>
  BANANA_ASPECT_RATIOS.map((ar) => ({ ...p, aspectRatio: ar })),
);

function methodCodeToBundleMethod(code: string): BundleMethod {
  if (code === 'text_to_image') return BundleMethod.IMAGE_GENERATION;
  if (
    code === 'image_edit' ||
    code === 'image_to_image' ||
    code === 'multi_reference_image'
  ) {
    return BundleMethod.IMAGE_EDIT;
  }
  if (code === 'text_to_video' || code === 'image_to_video') {
    return BundleMethod.VIDEO_GENERATION;
  }
  if (code === 'text_generation') return BundleMethod.TEXT_GENERATION;
  if (code === 'embedding') return BundleMethod.EMBEDDING;
  return BundleMethod.OTHER;
}

// Prices per TZ §11.3 — Kling fixed prices per (model, method, mode, duration, resolution)
interface KlingBundleSpec {
  modelSlug: string;
  methodCode: 'text_to_video' | 'image_to_video';
  mode: 'standard' | 'pro';
  durationSeconds: number;
  resolution: string;
  priceCents: number;
}

// Prices from the playground frontend presets (`PlaygroundClient.tsx`); the
// 10s tier is derived from the 5s tier with the ratio observed for kling-2.6
// / kling-v3 in the original ТЗ §11.3 table (~1.8×).
const KLING_PRICES: KlingBundleSpec[] = [
  { modelSlug: 'kling-2.6', methodCode: 'text_to_video', mode: 'standard', durationSeconds: 5,  resolution: '720p',  priceCents: 100 },
  { modelSlug: 'kling-2.6', methodCode: 'text_to_video', mode: 'standard', durationSeconds: 10, resolution: '720p',  priceCents: 180 },
  { modelSlug: 'kling-2.6', methodCode: 'text_to_video', mode: 'pro',      durationSeconds: 5,  resolution: '1080p', priceCents: 250 },
  { modelSlug: 'kling-2.6', methodCode: 'text_to_video', mode: 'pro',      durationSeconds: 10, resolution: '1080p', priceCents: 450 },
  // kling-v3 (Kling V3) — full grid: std/720p + pro/1080p, t2v + i2v, 5s+10s.
  // i2v prices mirror t2v (same convention as kling-v1-6 / kling-v2-1-master).
  // 10s = 5s × 1.8 (kling-2.6 / kling-v1-6 ratio).
  { modelSlug: 'kling-v3',  methodCode: 'text_to_video',  mode: 'standard', durationSeconds: 5,  resolution: '720p',  priceCents: 140 },
  { modelSlug: 'kling-v3',  methodCode: 'text_to_video',  mode: 'standard', durationSeconds: 10, resolution: '720p',  priceCents: 252 },
  { modelSlug: 'kling-v3',  methodCode: 'text_to_video',  mode: 'pro',      durationSeconds: 5,  resolution: '1080p', priceCents: 300 },
  { modelSlug: 'kling-v3',  methodCode: 'text_to_video',  mode: 'pro',      durationSeconds: 10, resolution: '1080p', priceCents: 550 },
  { modelSlug: 'kling-v3',  methodCode: 'image_to_video', mode: 'standard', durationSeconds: 5,  resolution: '720p',  priceCents: 140 },
  { modelSlug: 'kling-v3',  methodCode: 'image_to_video', mode: 'standard', durationSeconds: 10, resolution: '720p',  priceCents: 252 },
  { modelSlug: 'kling-v3',  methodCode: 'image_to_video', mode: 'pro',      durationSeconds: 5,  resolution: '1080p', priceCents: 300 },
  { modelSlug: 'kling-v3',  methodCode: 'image_to_video', mode: 'pro',      durationSeconds: 10, resolution: '1080p', priceCents: 550 },
  { modelSlug: 'kling-o1',  methodCode: 'image_to_video', mode: 'pro',     durationSeconds: 5,  resolution: '1080p', priceCents: 300 },
  { modelSlug: 'kling-o1',  methodCode: 'image_to_video', mode: 'pro',     durationSeconds: 10, resolution: '1080p', priceCents: 550 },
  // kling-v1-6 (Kling 1.6) — std/pro, 5s and 10s
  { modelSlug: 'kling-v1-6', methodCode: 'text_to_video',  mode: 'standard', durationSeconds: 5,  resolution: '720p',  priceCents: 14 },
  { modelSlug: 'kling-v1-6', methodCode: 'text_to_video',  mode: 'standard', durationSeconds: 10, resolution: '720p',  priceCents: 25 },
  { modelSlug: 'kling-v1-6', methodCode: 'text_to_video',  mode: 'pro',      durationSeconds: 5,  resolution: '1080p', priceCents: 28 },
  { modelSlug: 'kling-v1-6', methodCode: 'text_to_video',  mode: 'pro',      durationSeconds: 10, resolution: '1080p', priceCents: 50 },
  { modelSlug: 'kling-v1-6', methodCode: 'image_to_video', mode: 'standard', durationSeconds: 5,  resolution: '720p',  priceCents: 14 },
  { modelSlug: 'kling-v1-6', methodCode: 'image_to_video', mode: 'standard', durationSeconds: 10, resolution: '720p',  priceCents: 25 },
  { modelSlug: 'kling-v1-6', methodCode: 'image_to_video', mode: 'pro',      durationSeconds: 5,  resolution: '1080p', priceCents: 28 },
  { modelSlug: 'kling-v1-6', methodCode: 'image_to_video', mode: 'pro',      durationSeconds: 10, resolution: '1080p', priceCents: 50 },
  // kling-v2-1-master (Kling 2.1 Master) — pro only
  { modelSlug: 'kling-v2-1-master', methodCode: 'text_to_video',  mode: 'pro', durationSeconds: 5,  resolution: '1080p', priceCents: 70 },
  { modelSlug: 'kling-v2-1-master', methodCode: 'text_to_video',  mode: 'pro', durationSeconds: 10, resolution: '1080p', priceCents: 126 },
  { modelSlug: 'kling-v2-1-master', methodCode: 'image_to_video', mode: 'pro', durationSeconds: 5,  resolution: '1080p', priceCents: 70 },
  { modelSlug: 'kling-v2-1-master', methodCode: 'image_to_video', mode: 'pro', durationSeconds: 10, resolution: '1080p', priceCents: 126 },
  // kling-v2-5-turbo (Kling 2.5 Turbo) — full grid: std/720p + pro/1080p.
  // The schema (klingMethods in initial-catalog.ts) exposes BOTH std and pro
  // modes; missing std rows surfaced as price_not_configured for clients on
  // the standard tier. std prices derived from the pro/1080p tier at ×0.4
  // (matches kling-2.6: std=100 vs pro=250 → 0.4), 10s = 5s × 1.8.
  { modelSlug: 'kling-v2-5-turbo', methodCode: 'text_to_video',  mode: 'standard', durationSeconds: 5,  resolution: '720p',  priceCents: 20 },
  { modelSlug: 'kling-v2-5-turbo', methodCode: 'text_to_video',  mode: 'standard', durationSeconds: 10, resolution: '720p',  priceCents: 36 },
  { modelSlug: 'kling-v2-5-turbo', methodCode: 'text_to_video',  mode: 'pro',      durationSeconds: 5,  resolution: '1080p', priceCents: 50 },
  { modelSlug: 'kling-v2-5-turbo', methodCode: 'text_to_video',  mode: 'pro',      durationSeconds: 10, resolution: '1080p', priceCents: 90 },
  { modelSlug: 'kling-v2-5-turbo', methodCode: 'image_to_video', mode: 'standard', durationSeconds: 5,  resolution: '720p',  priceCents: 20 },
  { modelSlug: 'kling-v2-5-turbo', methodCode: 'image_to_video', mode: 'standard', durationSeconds: 10, resolution: '720p',  priceCents: 36 },
  { modelSlug: 'kling-v2-5-turbo', methodCode: 'image_to_video', mode: 'pro',      durationSeconds: 5,  resolution: '1080p', priceCents: 50 },
  { modelSlug: 'kling-v2-5-turbo', methodCode: 'image_to_video', mode: 'pro',      durationSeconds: 10, resolution: '1080p', priceCents: 90 },
];

function buildBundleKey(spec: {
  providerSlug: string;
  modelSlug: string;
  method: string;
  mode?: string | null;
  resolution?: string | null;
  durationSeconds?: number | null;
  aspectRatio?: string | null;
}): string {
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

async function seedDefaultTariff(): Promise<string> {
  const tariff = await prisma.tariff.upsert({
    where: { slug: 'default' },
    create: {
      slug: 'default',
      name: 'Default',
      description: 'Default public tariff (Stage 7 seed)',
      isDefault: true,
      isActive: true,
    },
    update: { isDefault: true, isActive: true },
  });
  console.log(`[seed] default tariff: id=${tariff.id}`);
  return tariff.id;
}

async function seedBananaPrices(tariffId: string): Promise<void> {
  let count = 0;
  for (const spec of BANANA_PRICES) {
    const bundleMethod = methodCodeToBundleMethod(spec.methodCode);
    const bundleKey = buildBundleKey({
      providerSlug: 'google_banana',
      modelSlug: spec.modelSlug,
      method: bundleMethod,
      mode: null,
      resolution: spec.resolution,
      durationSeconds: null,
      aspectRatio: spec.aspectRatio,
    });
    const bundle = await prisma.bundle.upsert({
      where: { bundleKey },
      create: {
        bundleKey,
        providerSlug: 'google_banana',
        modelSlug: spec.modelSlug,
        method: bundleMethod,
        resolution: spec.resolution,
        aspectRatio: spec.aspectRatio,
        unit: BundleUnit.PER_REQUEST,
        isActive: true,
      },
      update: { aspectRatio: spec.aspectRatio },
    });
    const priceUnits = BigInt(Math.round(spec.priceCents * Number(CENTS_TO_NANO)));
    await prisma.tariffBundlePrice.upsert({
      where: {
        tariffId_bundleId: { tariffId, bundleId: bundle.id },
      },
      create: {
        tariffId,
        bundleId: bundle.id,
        basePriceUnits: priceUnits,
      },
      update: { basePriceUnits: priceUnits },
    });
    count++;
  }
  console.log(`[seed] banana tariff prices upserted: ${count}`);
}

// --------------------------------------------------------------------------
// Gemini text + embedding pricing (Visavo / Vertex AI text methods).
//
// v1 plan: PER_REQUEST flat pricing — basePriceUnits covers a typical
// small call. We also record inputPerTokenUnits/outputPerTokenUnits in the
// same TariffBundlePrice row so a future switch to true PER_TOKEN
// reconciliation is data-only (no migration). Reference Vertex public
// pricing (per 1M tokens, USD):
//   gemini-2.5-pro:        $1.25 in / $5.00 out
//   gemini-2.5-flash:      $0.075 in / $0.30 out
//   gemini-2.5-flash-lite: $0.05 in / $0.20 out
//   text-embedding-004:    $0.025 in
// Margin: ~50% on per-token rates; flat per-call assumes ~3k input +
// ~1k output tokens for a typical chat completion (plenty of headroom for
// product-catalog Q&A workloads).
// --------------------------------------------------------------------------

interface GoogleTextBundleSpec {
  modelSlug: string;
  methodCode: 'text_generation' | 'embedding';
  bundleMethod: BundleMethod;
  // PER_REQUEST basePriceUnits in cents (flat per call).
  basePriceCents: number;
  // Per-token rates in cents per 1M tokens (for future PER_TOKEN reconciliation).
  inputCentsPer1M?: number;
  outputCentsPer1M?: number;
}

const GOOGLE_TEXT_PRICES: GoogleTextBundleSpec[] = [
  {
    modelSlug: 'gemini-2.5-pro',
    methodCode: 'text_generation',
    bundleMethod: BundleMethod.TEXT_GENERATION,
    basePriceCents: 2.5, // ~3k in × $1.25/M + ~1k out × $5/M + 50% margin ≈ $0.018 → bumped to $0.025
    inputCentsPer1M: 187, // $1.25 × 1.5 margin = $1.875 → 187.5¢/M
    outputCentsPer1M: 750, // $5 × 1.5 = $7.5 → 750¢/M
  },
  {
    modelSlug: 'gemini-2.5-flash',
    methodCode: 'text_generation',
    bundleMethod: BundleMethod.TEXT_GENERATION,
    basePriceCents: 0.3, // ~3k in × $0.075/M + ~1k out × $0.3/M + margin ≈ $0.001 → bumped to $0.003 floor
    inputCentsPer1M: 11,
    outputCentsPer1M: 45,
  },
  {
    modelSlug: 'gemini-2.5-flash-lite',
    methodCode: 'text_generation',
    bundleMethod: BundleMethod.TEXT_GENERATION,
    basePriceCents: 0.2,
    inputCentsPer1M: 7,
    outputCentsPer1M: 30,
  },
  {
    modelSlug: 'text-embedding-004',
    methodCode: 'embedding',
    bundleMethod: BundleMethod.EMBEDDING,
    basePriceCents: 0.1, // covers up to 100 inputs × ~500 tokens each at $0.025/M with margin
    inputCentsPer1M: 4, // $0.025 × ~1.6 margin
  },
];

async function seedGoogleTextPrices(tariffId: string): Promise<void> {
  let count = 0;
  for (const spec of GOOGLE_TEXT_PRICES) {
    const bundleKey = buildBundleKey({
      providerSlug: 'google_banana',
      modelSlug: spec.modelSlug,
      method: spec.bundleMethod,
      mode: null,
      resolution: null,
      durationSeconds: null,
      aspectRatio: null,
    });
    const bundle = await prisma.bundle.upsert({
      where: { bundleKey },
      create: {
        bundleKey,
        providerSlug: 'google_banana',
        modelSlug: spec.modelSlug,
        method: spec.bundleMethod,
        unit: BundleUnit.PER_REQUEST,
        isActive: true,
      },
      update: { isActive: true },
    });
    const basePriceUnits = BigInt(
      Math.round(spec.basePriceCents * Number(CENTS_TO_NANO)),
    );
    const inputPerTokenUnits =
      spec.inputCentsPer1M != null
        ? BigInt(Math.round((spec.inputCentsPer1M * Number(CENTS_TO_NANO)) / 1_000_000))
        : null;
    const outputPerTokenUnits =
      spec.outputCentsPer1M != null
        ? BigInt(Math.round((spec.outputCentsPer1M * Number(CENTS_TO_NANO)) / 1_000_000))
        : null;
    await prisma.tariffBundlePrice.upsert({
      where: { tariffId_bundleId: { tariffId, bundleId: bundle.id } },
      create: {
        tariffId,
        bundleId: bundle.id,
        basePriceUnits,
        inputPerTokenUnits,
        outputPerTokenUnits,
      },
      update: {
        basePriceUnits,
        inputPerTokenUnits,
        outputPerTokenUnits,
      },
    });
    count++;
  }
  console.log(`[seed] google_banana text/embedding prices upserted: ${count}`);
}

/**
 * Existing google_banana ProviderAccount rows may have been created with a
 * narrow `supportedMethodIds` / `supportedModelIds` whitelist covering the
 * original image-only methods. After we add text_generation + embedding,
 * pickAccount() filters those accounts out for the new methods → user-facing
 * `provider_outage`. Two policies are safe here:
 *   a) Clear the lists (empty = all methods/models for this provider allowed).
 *   b) Append the new method/model IDs to the existing lists.
 *
 * We pick (a) since these scopes were never deliberately curated — they
 * were captured at account-creation time and serve no audit purpose. The
 * Provider relationship already constrains "which provider's models/methods
 * are even reachable" by this account.
 *
 * Idempotent: only writes when the row actually carries a non-empty scope.
 */
async function rescopeBananaAccounts(): Promise<void> {
  const provider = await prisma.provider.findUnique({
    where: { code: 'google_banana' },
  });
  if (!provider) return;
  const stale = await prisma.providerAccount.findMany({
    where: {
      providerId: provider.id,
      OR: [
        { supportedModelIds: { isEmpty: false } },
        { supportedMethodIds: { isEmpty: false } },
      ],
    },
    select: { id: true, name: true },
  });
  if (stale.length === 0) {
    console.log('[seed] no banana accounts with narrow scope — nothing to rescope');
    return;
  }
  await prisma.providerAccount.updateMany({
    where: { id: { in: stale.map((s) => s.id) } },
    data: { supportedModelIds: [], supportedMethodIds: [] },
  });
  console.log(
    `[seed] rescoped ${stale.length} banana accounts (cleared model/method whitelists): ${stale
      .map((s) => `${s.name}#${s.id.slice(-6)}`)
      .join(', ')}`,
  );
}

async function seedBananaProviderAccount(): Promise<void> {
  const apiKey = process.env.GOOGLE_BANANA_API_KEY;
  if (!apiKey) {
    console.log('[seed] GOOGLE_BANANA_API_KEY not set — skipping ProviderAccount');
    return;
  }
  const provider = await prisma.provider.findUnique({
    where: { code: 'google_banana' },
  });
  if (!provider) {
    console.warn('[seed] provider google_banana not found — skipping account');
    return;
  }
  const existing = await prisma.providerAccount.findFirst({
    where: { providerId: provider.id, name: 'env-account' },
  });
  if (existing) {
    await prisma.providerAccount.update({
      where: { id: existing.id },
      data: {
        credentials: { apiKey } as Prisma.InputJsonValue,
        status: ProviderAccountStatus.ACTIVE,
      },
    });
    console.log(`[seed] env-account refreshed: ${existing.id}`);
    return;
  }
  const acc = await prisma.providerAccount.create({
    data: {
      providerId: provider.id,
      name: 'env-account',
      description: 'Auto-seeded from GOOGLE_BANANA_API_KEY env var',
      credentials: { apiKey } as Prisma.InputJsonValue,
      status: ProviderAccountStatus.ACTIVE,
      rotationEnabled: true,
      maxConcurrentTasks: 3,
    },
  });
  console.log(`[seed] env-account created: ${acc.id}`);
}

async function seedKlingPrices(tariffId: string): Promise<void> {
  let count = 0;
  for (const spec of KLING_PRICES) {
    const bundleMethod = methodCodeToBundleMethod(spec.methodCode);
    const bundleKey = buildBundleKey({
      providerSlug: 'kling_ai',
      modelSlug: spec.modelSlug,
      method: bundleMethod,
      mode: spec.mode,
      resolution: spec.resolution,
      durationSeconds: spec.durationSeconds,
      aspectRatio: null,
    });
    const bundle = await prisma.bundle.upsert({
      where: { bundleKey },
      create: {
        bundleKey,
        providerSlug: 'kling_ai',
        modelSlug: spec.modelSlug,
        method: bundleMethod,
        mode: spec.mode,
        resolution: spec.resolution,
        durationSeconds: spec.durationSeconds,
        unit: BundleUnit.PER_REQUEST,
        isActive: true,
      },
      update: {},
    });
    const priceUnits = BigInt(Math.round(spec.priceCents * Number(CENTS_TO_NANO)));
    await prisma.tariffBundlePrice.upsert({
      where: { tariffId_bundleId: { tariffId, bundleId: bundle.id } },
      create: {
        tariffId,
        bundleId: bundle.id,
        basePriceUnits: priceUnits,
      },
      update: { basePriceUnits: priceUnits },
    });
    count++;
  }
  console.log(`[seed] kling tariff prices upserted: ${count}`);
}

async function seedKlingProviderAccount(): Promise<void> {
  const accessKey = process.env.KLING_ACCESS_KEY;
  const secretKey = process.env.KLING_SECRET_KEY;
  if (!accessKey || !secretKey) {
    console.log(
      '[seed] KLING_ACCESS_KEY/KLING_SECRET_KEY not set — skipping Kling ProviderAccount',
    );
    return;
  }
  const provider = await prisma.provider.findUnique({
    where: { code: 'kling_ai' },
  });
  if (!provider) {
    console.warn('[seed] provider kling_ai not found — skipping account');
    return;
  }
  const credentials = { access_key: accessKey, secret_key: secretKey };
  const existing = await prisma.providerAccount.findFirst({
    where: { providerId: provider.id, name: 'env-account' },
  });
  if (existing) {
    await prisma.providerAccount.update({
      where: { id: existing.id },
      data: {
        credentials: credentials as Prisma.InputJsonValue,
        status: ProviderAccountStatus.ACTIVE,
      },
    });
    console.log(`[seed] kling env-account refreshed: ${existing.id}`);
    return;
  }
  const acc = await prisma.providerAccount.create({
    data: {
      providerId: provider.id,
      name: 'env-account',
      description:
        'Auto-seeded from KLING_ACCESS_KEY / KLING_SECRET_KEY env vars',
      credentials: credentials as Prisma.InputJsonValue,
      status: ProviderAccountStatus.ACTIVE,
      rotationEnabled: true,
      maxConcurrentTasks: 2,
    },
  });
  console.log(`[seed] kling env-account created: ${acc.id}`);
}

// ---------------------------------------------------------------------------
// Stage 8 — Veo PER_SECOND prices + env-based ProviderAccount.
// Prices per ТЗ §11.2. $X.YY/sec → BigInt(cents * 1e6) nano-USD/sec.
// ---------------------------------------------------------------------------

function dollarsPerSecondToUnits(usd: number): bigint {
  return BigInt(Math.round(usd * 1e8));
}

interface VeoBundleSpec {
  modelSlug: string;
  methodCode: string;
  resolution: string;
  pricePerSecondUsd: number;
}

const VEO_PRICES: VeoBundleSpec[] = [
  // text_to_video
  { modelSlug: 'veo-3.0-generate-001',          methodCode: 'text_to_video', resolution: '720p',  pricePerSecondUsd: 0.0625 },
  { modelSlug: 'veo-3.0-generate-001',          methodCode: 'text_to_video', resolution: '1080p', pricePerSecondUsd: 0.40 },
  { modelSlug: 'veo-3.0-fast-generate-001',     methodCode: 'text_to_video', resolution: '720p',  pricePerSecondUsd: 0.03125 },
  { modelSlug: 'veo-3.0-fast-generate-001',     methodCode: 'text_to_video', resolution: '1080p', pricePerSecondUsd: 0.04375 },
  { modelSlug: 'veo-3.0-fast-generate-001',     methodCode: 'text_to_video', resolution: '4K',    pricePerSecondUsd: 0.55 },
  { modelSlug: 'veo-3.1-generate-preview',      methodCode: 'text_to_video', resolution: '720p',  pricePerSecondUsd: 0.0625 },
  { modelSlug: 'veo-3.1-generate-preview',      methodCode: 'text_to_video', resolution: '1080p', pricePerSecondUsd: 0.40 },
  { modelSlug: 'veo-3.1-generate-preview',      methodCode: 'text_to_video', resolution: '4K',    pricePerSecondUsd: 1.10 },
  { modelSlug: 'veo-3.1-fast-generate-preview', methodCode: 'text_to_video', resolution: '720p',  pricePerSecondUsd: 0.03125 },
  { modelSlug: 'veo-3.1-fast-generate-preview', methodCode: 'text_to_video', resolution: '1080p', pricePerSecondUsd: 0.04375 },
  { modelSlug: 'veo-3.1-fast-generate-preview', methodCode: 'text_to_video', resolution: '4K',    pricePerSecondUsd: 0.55 },
  { modelSlug: 'veo-3.1-lite-generate-preview', methodCode: 'text_to_video', resolution: '720p',  pricePerSecondUsd: 0.10 },
  { modelSlug: 'veo-3.1-lite-generate-preview', methodCode: 'text_to_video', resolution: '1080p', pricePerSecondUsd: 0.15 },
  // image_to_video (+~$0.05/s vs text_to_video)
  { modelSlug: 'veo-3.0-generate-001',          methodCode: 'image_to_video', resolution: '720p',  pricePerSecondUsd: 0.0625 },
  { modelSlug: 'veo-3.0-generate-001',          methodCode: 'image_to_video', resolution: '1080p', pricePerSecondUsd: 0.40 },
  { modelSlug: 'veo-3.0-fast-generate-001',     methodCode: 'image_to_video', resolution: '720p',  pricePerSecondUsd: 0.03125 },
  { modelSlug: 'veo-3.0-fast-generate-001',     methodCode: 'image_to_video', resolution: '1080p', pricePerSecondUsd: 0.04375 },
  { modelSlug: 'veo-3.0-fast-generate-001',     methodCode: 'image_to_video', resolution: '4K',    pricePerSecondUsd: 0.65 },
  { modelSlug: 'veo-3.1-generate-preview',      methodCode: 'image_to_video', resolution: '720p',  pricePerSecondUsd: 0.0625 },
  { modelSlug: 'veo-3.1-generate-preview',      methodCode: 'image_to_video', resolution: '1080p', pricePerSecondUsd: 0.40 },
  { modelSlug: 'veo-3.1-generate-preview',      methodCode: 'image_to_video', resolution: '4K',    pricePerSecondUsd: 1.20 },
  { modelSlug: 'veo-3.1-fast-generate-preview', methodCode: 'image_to_video', resolution: '720p',  pricePerSecondUsd: 0.03125 },
  { modelSlug: 'veo-3.1-fast-generate-preview', methodCode: 'image_to_video', resolution: '1080p', pricePerSecondUsd: 0.04375 },
  { modelSlug: 'veo-3.1-fast-generate-preview', methodCode: 'image_to_video', resolution: '4K',    pricePerSecondUsd: 0.65 },
];

async function seedVeoPrices(tariffId: string): Promise<void> {
  let count = 0;
  for (const spec of VEO_PRICES) {
    const bundleKey = buildBundleKey({
      providerSlug: 'google_veo',
      modelSlug: spec.modelSlug,
      method: BundleMethod.VIDEO_GENERATION,
      mode: spec.methodCode, // distinguishes text_to_video vs image_to_video
      resolution: spec.resolution,
      durationSeconds: null,
      aspectRatio: null,
    });
    const bundle = await prisma.bundle.upsert({
      where: { bundleKey },
      create: {
        bundleKey,
        providerSlug: 'google_veo',
        modelSlug: spec.modelSlug,
        method: BundleMethod.VIDEO_GENERATION,
        mode: spec.methodCode,
        resolution: spec.resolution,
        unit: BundleUnit.PER_SECOND,
        isActive: true,
      },
      update: { unit: BundleUnit.PER_SECOND },
    });
    const perSecondUnits = dollarsPerSecondToUnits(spec.pricePerSecondUsd);
    await prisma.tariffBundlePrice.upsert({
      where: { tariffId_bundleId: { tariffId, bundleId: bundle.id } },
      create: { tariffId, bundleId: bundle.id, perSecondUnits },
      update: { perSecondUnits, basePriceUnits: null },
    });
    count++;
  }
  console.log(`[seed] veo tariff prices upserted: ${count}`);
}

async function seedVeoProviderAccount(): Promise<void> {
  const apiKey = process.env.GOOGLE_VEO_API_KEY;
  if (!apiKey) {
    console.log('[seed] GOOGLE_VEO_API_KEY not set — skipping Veo ProviderAccount');
    return;
  }
  const provider = await prisma.provider.findUnique({
    where: { code: 'google_veo' },
  });
  if (!provider) {
    console.warn('[seed] provider google_veo not found — skipping account');
    return;
  }
  const existing = await prisma.providerAccount.findFirst({
    where: { providerId: provider.id, name: 'env-account' },
  });
  if (existing) {
    await prisma.providerAccount.update({
      where: { id: existing.id },
      data: {
        credentials: { apiKey } as Prisma.InputJsonValue,
        status: ProviderAccountStatus.ACTIVE,
      },
    });
    console.log(`[seed] veo env-account refreshed: ${existing.id}`);
    return;
  }
  const acc = await prisma.providerAccount.create({
    data: {
      providerId: provider.id,
      name: 'env-account',
      description: 'Auto-seeded from GOOGLE_VEO_API_KEY env var',
      credentials: { apiKey } as Prisma.InputJsonValue,
      status: ProviderAccountStatus.ACTIVE,
      rotationEnabled: true,
      maxConcurrentTasks: 3,
    },
  });
  console.log(`[seed] veo env-account created: ${acc.id}`);
}

// ---------------------------------------------------------------------------
// Seedance — PER_SECOND prices with ×1.15 retail markup.
// Upstream derived from Volcano Engine's official token rate: 0.015 ¥ per
// 1k tokens, where tokens = (W × H × fps × duration) / 1024. The published
// 5s/1080p reference price (3.67 ¥ ≈ $0.51) reproduces exactly when applied
// at 1920×1080 × 24fps. CNY converted at 7.2 ¥/USD.
//   Pro    480p ≈ $0.020/s upstream → $0.023/s retail
//   Pro    720p ≈ $0.045/s upstream → $0.052/s retail
//   Pro   1080p ≈ $0.102/s upstream → $0.117/s retail
//   Lite   480p ≈ $0.010/s upstream → $0.012/s retail (~50% of Pro)
//   Lite   720p ≈ $0.022/s upstream → $0.025/s retail
// Sources: aibase.com/news/18826 (Volcengine Seedance 1.0 Pro launch),
// technode 2026-03-05 (Seedance 2.0 ≈ $0.14/s benchmark).
// ---------------------------------------------------------------------------

interface SeedanceBundleSpec {
  modelSlug: string;
  methodCode: 'text_to_video' | 'image_to_video';
  resolution: string;
  pricePerSecondUsd: number;
}

const SEEDANCE_PRICES: SeedanceBundleSpec[] = [
  // Pro — both t2v and i2v, 480p / 720p / 1080p
  { modelSlug: 'doubao-seedance-1-0-pro-250528', methodCode: 'text_to_video',  resolution: '480p',  pricePerSecondUsd: 0.023 },
  { modelSlug: 'doubao-seedance-1-0-pro-250528', methodCode: 'text_to_video',  resolution: '720p',  pricePerSecondUsd: 0.052 },
  { modelSlug: 'doubao-seedance-1-0-pro-250528', methodCode: 'text_to_video',  resolution: '1080p', pricePerSecondUsd: 0.117 },
  { modelSlug: 'doubao-seedance-1-0-pro-250528', methodCode: 'image_to_video', resolution: '480p',  pricePerSecondUsd: 0.023 },
  { modelSlug: 'doubao-seedance-1-0-pro-250528', methodCode: 'image_to_video', resolution: '720p',  pricePerSecondUsd: 0.052 },
  { modelSlug: 'doubao-seedance-1-0-pro-250528', methodCode: 'image_to_video', resolution: '1080p', pricePerSecondUsd: 0.117 },
  // Lite t2v
  { modelSlug: 'doubao-seedance-1-0-lite-t2v-250428', methodCode: 'text_to_video', resolution: '480p', pricePerSecondUsd: 0.012 },
  { modelSlug: 'doubao-seedance-1-0-lite-t2v-250428', methodCode: 'text_to_video', resolution: '720p', pricePerSecondUsd: 0.025 },
  // Lite i2v
  { modelSlug: 'doubao-seedance-1-0-lite-i2v-250428', methodCode: 'image_to_video', resolution: '480p', pricePerSecondUsd: 0.012 },
  { modelSlug: 'doubao-seedance-1-0-lite-i2v-250428', methodCode: 'image_to_video', resolution: '720p', pricePerSecondUsd: 0.025 },
];

async function seedSeedancePrices(tariffId: string): Promise<void> {
  let count = 0;
  for (const spec of SEEDANCE_PRICES) {
    const bundleKey = buildBundleKey({
      providerSlug: 'seedance',
      modelSlug: spec.modelSlug,
      method: BundleMethod.VIDEO_GENERATION,
      mode: spec.methodCode, // discriminates t2v vs i2v
      resolution: spec.resolution,
      durationSeconds: null,
      aspectRatio: null,
    });
    const bundle = await prisma.bundle.upsert({
      where: { bundleKey },
      create: {
        bundleKey,
        providerSlug: 'seedance',
        modelSlug: spec.modelSlug,
        method: BundleMethod.VIDEO_GENERATION,
        mode: spec.methodCode,
        resolution: spec.resolution,
        unit: BundleUnit.PER_SECOND,
        isActive: true,
      },
      update: { unit: BundleUnit.PER_SECOND },
    });
    const perSecondUnits = dollarsPerSecondToUnits(spec.pricePerSecondUsd);
    await prisma.tariffBundlePrice.upsert({
      where: { tariffId_bundleId: { tariffId, bundleId: bundle.id } },
      create: { tariffId, bundleId: bundle.id, perSecondUnits },
      update: { perSecondUnits, basePriceUnits: null },
    });
    count++;
  }
  console.log(`[seed] seedance tariff prices upserted: ${count}`);
}

// ---------------------------------------------------------------------------
// OpenRouter Video — PER_SECOND prices for the Seedance 2.0 family routed
// through OpenRouter's unified /api/v1/videos endpoint. Baseline cost from
// a smoke-test invoice (Seedance 2.0 Fast 480p, 5s = $0.27 → $0.054/s
// upstream). Other tiers extrapolated from OpenRouter's published per-token
// rates (Fast $5.60/Mt, Pro $7.00/Mt, 1.5 Pro $2.40/Mt) — these are rough
// pragmatic retail numbers that get the admit gate to find a bundle; the
// operator should re-tune after a few real invoices.
// ---------------------------------------------------------------------------

interface OpenRouterBundleSpec {
  modelSlug: string;
  methodCode: 'text_to_video' | 'image_to_video';
  resolution: string;
  pricePerSecondUsd: number;
}

const OPENROUTER_PRICES: OpenRouterBundleSpec[] = [
  // Seedance 2.0 Fast — no 1080p tier upstream. ~$0.054/s confirmed via curl.
  { modelSlug: 'openrouter-seedance-2-0-fast', methodCode: 'text_to_video',  resolution: '480p',  pricePerSecondUsd: 0.081 },
  { modelSlug: 'openrouter-seedance-2-0-fast', methodCode: 'text_to_video',  resolution: '720p',  pricePerSecondUsd: 0.17 },
  { modelSlug: 'openrouter-seedance-2-0-fast', methodCode: 'image_to_video', resolution: '480p',  pricePerSecondUsd: 0.081 },
  { modelSlug: 'openrouter-seedance-2-0-fast', methodCode: 'image_to_video', resolution: '720p',  pricePerSecondUsd: 0.17 },
  // Seedance 2.0 full — 1.25× of Fast rate (Pro $7.00 vs Fast $5.60).
  { modelSlug: 'openrouter-seedance-2-0', methodCode: 'text_to_video',  resolution: '480p',  pricePerSecondUsd: 0.10 },
  { modelSlug: 'openrouter-seedance-2-0', methodCode: 'text_to_video',  resolution: '720p',  pricePerSecondUsd: 0.21 },
  { modelSlug: 'openrouter-seedance-2-0', methodCode: 'text_to_video',  resolution: '1080p', pricePerSecondUsd: 0.45 },
  { modelSlug: 'openrouter-seedance-2-0', methodCode: 'image_to_video', resolution: '480p',  pricePerSecondUsd: 0.10 },
  { modelSlug: 'openrouter-seedance-2-0', methodCode: 'image_to_video', resolution: '720p',  pricePerSecondUsd: 0.21 },
  { modelSlug: 'openrouter-seedance-2-0', methodCode: 'image_to_video', resolution: '1080p', pricePerSecondUsd: 0.45 },
  // Seedance 1.5 Pro — 0.43× of Fast (cheaper at $2.40/Mt vs Fast $5.60/Mt).
  { modelSlug: 'openrouter-seedance-1-5-pro', methodCode: 'text_to_video',  resolution: '480p',  pricePerSecondUsd: 0.035 },
  { modelSlug: 'openrouter-seedance-1-5-pro', methodCode: 'text_to_video',  resolution: '720p',  pricePerSecondUsd: 0.085 },
  { modelSlug: 'openrouter-seedance-1-5-pro', methodCode: 'text_to_video',  resolution: '1080p', pricePerSecondUsd: 0.17 },
  { modelSlug: 'openrouter-seedance-1-5-pro', methodCode: 'image_to_video', resolution: '480p',  pricePerSecondUsd: 0.035 },
  { modelSlug: 'openrouter-seedance-1-5-pro', methodCode: 'image_to_video', resolution: '720p',  pricePerSecondUsd: 0.085 },
  { modelSlug: 'openrouter-seedance-1-5-pro', methodCode: 'image_to_video', resolution: '1080p', pricePerSecondUsd: 0.17 },
];

async function seedOpenRouterPrices(tariffId: string): Promise<void> {
  let count = 0;
  for (const spec of OPENROUTER_PRICES) {
    const bundleKey = buildBundleKey({
      providerSlug: 'seedance',
      modelSlug: spec.modelSlug,
      method: BundleMethod.VIDEO_GENERATION,
      mode: spec.methodCode, // discriminates t2v vs i2v
      resolution: spec.resolution,
      durationSeconds: null,
      aspectRatio: null,
    });
    const bundle = await prisma.bundle.upsert({
      where: { bundleKey },
      create: {
        bundleKey,
        providerSlug: 'seedance',
        modelSlug: spec.modelSlug,
        method: BundleMethod.VIDEO_GENERATION,
        mode: spec.methodCode,
        resolution: spec.resolution,
        unit: BundleUnit.PER_SECOND,
        isActive: true,
      },
      update: { unit: BundleUnit.PER_SECOND },
    });
    const perSecondUnits = dollarsPerSecondToUnits(spec.pricePerSecondUsd);
    await prisma.tariffBundlePrice.upsert({
      where: { tariffId_bundleId: { tariffId, bundleId: bundle.id } },
      create: { tariffId, bundleId: bundle.id, perSecondUnits },
      update: { perSecondUnits, basePriceUnits: null },
    });
    count++;
  }
  console.log(`[seed] openrouter-routed seedance prices upserted under provider=seedance: ${count}`);
}

async function seedOpenRouterProviderAccount(): Promise<void> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.log('[seed] OPENROUTER_API_KEY not set — skipping OpenRouter ProviderAccount');
    return;
  }
  // OpenRouter is internally part of the `seedance` provider — same models
  // exposed publicly, routed under the hood through OpenRouter's video API.
  // The account is scoped (via supportedModelIds, set below) to only the
  // openrouter-seedance-* models so BytePlus-direct doubao-* models keep
  // going through the SEEDANCE_API_KEY env-account.
  const provider = await prisma.provider.findUnique({ where: { code: 'seedance' } });
  if (!provider) {
    console.warn('[seed] provider seedance not found — skipping openrouter account');
    return;
  }
  // Restrict the OpenRouter account to the three models it actually handles.
  const orModels = await prisma.model.findMany({
    where: { providerId: provider.id, code: { startsWith: 'openrouter-seedance-' } },
    select: { id: true },
  });
  const supportedModelIds = orModels.map((m) => m.id);
  const existing = await prisma.providerAccount.findFirst({
    where: { providerId: provider.id, name: 'OpenRouter main' },
  });
  if (existing) {
    await prisma.providerAccount.update({
      where: { id: existing.id },
      data: {
        credentials: { apiKey } as Prisma.InputJsonValue,
        status: ProviderAccountStatus.ACTIVE,
        supportedModelIds,
      },
    });
    console.log(`[seed] OpenRouter main account refreshed: ${existing.id} (supportedModels=${supportedModelIds.length})`);
    return;
  }
  const acc = await prisma.providerAccount.create({
    data: {
      providerId: provider.id,
      name: 'OpenRouter main',
      description: 'Auto-seeded from OPENROUTER_API_KEY env var — routes Seedance 2.0/1.5 Pro under provider=seedance.',
      credentials: { apiKey } as Prisma.InputJsonValue,
      status: ProviderAccountStatus.ACTIVE,
      rotationEnabled: true,
      maxConcurrentTasks: 5,
      supportedModelIds,
    },
  });
  console.log(`[seed] OpenRouter main account created: ${acc.id} (supportedModels=${supportedModelIds.length})`);
}

async function seedSeedanceProviderAccount(): Promise<void> {
  const apiKey = process.env.SEEDANCE_API_KEY;
  if (!apiKey) {
    console.log('[seed] SEEDANCE_API_KEY not set — skipping Seedance ProviderAccount');
    return;
  }
  const provider = await prisma.provider.findUnique({ where: { code: 'seedance' } });
  if (!provider) {
    console.warn('[seed] provider seedance not found — skipping account');
    return;
  }
  // Scope to the BytePlus-direct doubao-* models only; the OpenRouter-routed
  // openrouter-seedance-* models live under the same provider but are served
  // by the OpenRouter main account (see seedOpenRouterProviderAccount).
  const directModels = await prisma.model.findMany({
    where: { providerId: provider.id, code: { startsWith: 'doubao-seedance-' } },
    select: { id: true },
  });
  const supportedModelIds = directModels.map((m) => m.id);
  const existing = await prisma.providerAccount.findFirst({
    where: { providerId: provider.id, name: 'env-account' },
  });
  if (existing) {
    await prisma.providerAccount.update({
      where: { id: existing.id },
      data: {
        credentials: { apiKey } as Prisma.InputJsonValue,
        status: ProviderAccountStatus.ACTIVE,
        supportedModelIds,
      },
    });
    console.log(`[seed] seedance env-account refreshed: ${existing.id} (supportedModels=${supportedModelIds.length})`);
    return;
  }
  const acc = await prisma.providerAccount.create({
    data: {
      providerId: provider.id,
      name: 'env-account',
      description: 'Auto-seeded from SEEDANCE_API_KEY env var — BytePlus-direct doubao-* models.',
      credentials: { apiKey } as Prisma.InputJsonValue,
      status: ProviderAccountStatus.ACTIVE,
      rotationEnabled: true,
      maxConcurrentTasks: 3,
      supportedModelIds,
    },
  });
  console.log(`[seed] seedance env-account created: ${acc.id} (supportedModels=${supportedModelIds.length})`);
}

// ---------------------------------------------------------------------------
// OpenAI Images — PER_REQUEST prices (× 1.15 retail markup).
// gpt-image-1: quality (low/medium/high) × size matrix; same for t2i and edit.
// dall-e-3: standard/hd × 3 sizes, t2i only.
// dall-e-2: size only (no quality dim), t2i + edit at same price.
// ---------------------------------------------------------------------------

interface OpenAIImageBundleSpec {
  modelSlug: string;
  methodCode: 'text_to_image' | 'image_edit';
  mode: string | null;
  resolution: string;
  priceCents: number;
}

// gpt-image-2 raw OpenAI per-image cost (Apr 2026), 1024×1024 baseline:
//   low $0.006 · medium $0.053 · high $0.211
// Larger sizes scale ~linearly with output_tokens, which scale with pixel
// count. Margin: ~15% on top of raw cost (matches gpt-image-1 markup).
const GPT_IMAGE_2_PRICES: OpenAIImageBundleSpec[] = [
  // 1024×1024 baseline
  { modelSlug: 'gpt-image-2', methodCode: 'text_to_image', mode: 'low',    resolution: '1024x1024', priceCents: 0.69 },
  { modelSlug: 'gpt-image-2', methodCode: 'text_to_image', mode: 'medium', resolution: '1024x1024', priceCents: 6.1 },
  { modelSlug: 'gpt-image-2', methodCode: 'text_to_image', mode: 'high',   resolution: '1024x1024', priceCents: 24.3 },
  { modelSlug: 'gpt-image-2', methodCode: 'text_to_image', mode: 'auto',   resolution: '1024x1024', priceCents: 6.1 },
  // 1.5x area (portrait / landscape)
  { modelSlug: 'gpt-image-2', methodCode: 'text_to_image', mode: 'low',    resolution: '1024x1536', priceCents: 1.04 },
  { modelSlug: 'gpt-image-2', methodCode: 'text_to_image', mode: 'low',    resolution: '1536x1024', priceCents: 1.04 },
  { modelSlug: 'gpt-image-2', methodCode: 'text_to_image', mode: 'medium', resolution: '1024x1536', priceCents: 9.15 },
  { modelSlug: 'gpt-image-2', methodCode: 'text_to_image', mode: 'medium', resolution: '1536x1024', priceCents: 9.15 },
  { modelSlug: 'gpt-image-2', methodCode: 'text_to_image', mode: 'high',   resolution: '1024x1536', priceCents: 36.4 },
  { modelSlug: 'gpt-image-2', methodCode: 'text_to_image', mode: 'high',   resolution: '1536x1024', priceCents: 36.4 },
  { modelSlug: 'gpt-image-2', methodCode: 'text_to_image', mode: 'auto',   resolution: '1024x1536', priceCents: 9.15 },
  { modelSlug: 'gpt-image-2', methodCode: 'text_to_image', mode: 'auto',   resolution: '1536x1024', priceCents: 9.15 },
  // 4x area (2K square)
  { modelSlug: 'gpt-image-2', methodCode: 'text_to_image', mode: 'low',    resolution: '2048x2048', priceCents: 2.76 },
  { modelSlug: 'gpt-image-2', methodCode: 'text_to_image', mode: 'medium', resolution: '2048x2048', priceCents: 24.4 },
  { modelSlug: 'gpt-image-2', methodCode: 'text_to_image', mode: 'high',   resolution: '2048x2048', priceCents: 97.0 },
  { modelSlug: 'gpt-image-2', methodCode: 'text_to_image', mode: 'auto',   resolution: '2048x2048', priceCents: 24.4 },
  // ~8x area (4K UHD)
  { modelSlug: 'gpt-image-2', methodCode: 'text_to_image', mode: 'low',    resolution: '3840x2160', priceCents: 5.8 },
  { modelSlug: 'gpt-image-2', methodCode: 'text_to_image', mode: 'low',    resolution: '2160x3840', priceCents: 5.8 },
  { modelSlug: 'gpt-image-2', methodCode: 'text_to_image', mode: 'medium', resolution: '3840x2160', priceCents: 51.2 },
  { modelSlug: 'gpt-image-2', methodCode: 'text_to_image', mode: 'medium', resolution: '2160x3840', priceCents: 51.2 },
  { modelSlug: 'gpt-image-2', methodCode: 'text_to_image', mode: 'high',   resolution: '3840x2160', priceCents: 204 },
  { modelSlug: 'gpt-image-2', methodCode: 'text_to_image', mode: 'high',   resolution: '2160x3840', priceCents: 204 },
  { modelSlug: 'gpt-image-2', methodCode: 'text_to_image', mode: 'auto',   resolution: '3840x2160', priceCents: 51.2 },
  { modelSlug: 'gpt-image-2', methodCode: 'text_to_image', mode: 'auto',   resolution: '2160x3840', priceCents: 51.2 },
];

const GPT_IMAGE_2_EDIT_PRICES: OpenAIImageBundleSpec[] = GPT_IMAGE_2_PRICES.map(
  (p) => ({ ...p, methodCode: 'image_edit' }),
);

const OPENAI_IMAGE_PRICES: OpenAIImageBundleSpec[] = [
  ...GPT_IMAGE_2_PRICES,
  ...GPT_IMAGE_2_EDIT_PRICES,
  // gpt-image-1 t2i — quality × size
  { modelSlug: 'gpt-image-1', methodCode: 'text_to_image', mode: 'low',    resolution: '1024x1024', priceCents: 1.27 },
  { modelSlug: 'gpt-image-1', methodCode: 'text_to_image', mode: 'low',    resolution: '1024x1536', priceCents: 1.84 },
  { modelSlug: 'gpt-image-1', methodCode: 'text_to_image', mode: 'low',    resolution: '1536x1024', priceCents: 1.84 },
  { modelSlug: 'gpt-image-1', methodCode: 'text_to_image', mode: 'medium', resolution: '1024x1024', priceCents: 4.83 },
  { modelSlug: 'gpt-image-1', methodCode: 'text_to_image', mode: 'medium', resolution: '1024x1536', priceCents: 7.25 },
  { modelSlug: 'gpt-image-1', methodCode: 'text_to_image', mode: 'medium', resolution: '1536x1024', priceCents: 7.25 },
  { modelSlug: 'gpt-image-1', methodCode: 'text_to_image', mode: 'high',   resolution: '1024x1024', priceCents: 19.21 },
  { modelSlug: 'gpt-image-1', methodCode: 'text_to_image', mode: 'high',   resolution: '1024x1536', priceCents: 28.75 },
  { modelSlug: 'gpt-image-1', methodCode: 'text_to_image', mode: 'high',   resolution: '1536x1024', priceCents: 28.75 },
  // auto → defaults to medium-tier billing
  { modelSlug: 'gpt-image-1', methodCode: 'text_to_image', mode: 'auto',   resolution: '1024x1024', priceCents: 4.83 },
  { modelSlug: 'gpt-image-1', methodCode: 'text_to_image', mode: 'auto',   resolution: '1024x1536', priceCents: 7.25 },
  { modelSlug: 'gpt-image-1', methodCode: 'text_to_image', mode: 'auto',   resolution: '1536x1024', priceCents: 7.25 },

  // gpt-image-1 image_edit — same matrix
  { modelSlug: 'gpt-image-1', methodCode: 'image_edit', mode: 'low',    resolution: '1024x1024', priceCents: 1.27 },
  { modelSlug: 'gpt-image-1', methodCode: 'image_edit', mode: 'low',    resolution: '1024x1536', priceCents: 1.84 },
  { modelSlug: 'gpt-image-1', methodCode: 'image_edit', mode: 'low',    resolution: '1536x1024', priceCents: 1.84 },
  { modelSlug: 'gpt-image-1', methodCode: 'image_edit', mode: 'medium', resolution: '1024x1024', priceCents: 4.83 },
  { modelSlug: 'gpt-image-1', methodCode: 'image_edit', mode: 'medium', resolution: '1024x1536', priceCents: 7.25 },
  { modelSlug: 'gpt-image-1', methodCode: 'image_edit', mode: 'medium', resolution: '1536x1024', priceCents: 7.25 },
  { modelSlug: 'gpt-image-1', methodCode: 'image_edit', mode: 'high',   resolution: '1024x1024', priceCents: 19.21 },
  { modelSlug: 'gpt-image-1', methodCode: 'image_edit', mode: 'high',   resolution: '1024x1536', priceCents: 28.75 },
  { modelSlug: 'gpt-image-1', methodCode: 'image_edit', mode: 'high',   resolution: '1536x1024', priceCents: 28.75 },
  { modelSlug: 'gpt-image-1', methodCode: 'image_edit', mode: 'auto',   resolution: '1024x1024', priceCents: 4.83 },
  { modelSlug: 'gpt-image-1', methodCode: 'image_edit', mode: 'auto',   resolution: '1024x1536', priceCents: 7.25 },
  { modelSlug: 'gpt-image-1', methodCode: 'image_edit', mode: 'auto',   resolution: '1536x1024', priceCents: 7.25 },

  // dall-e-3 t2i — standard/hd × 3 sizes
  { modelSlug: 'dall-e-3', methodCode: 'text_to_image', mode: 'standard', resolution: '1024x1024', priceCents: 4.6 },
  { modelSlug: 'dall-e-3', methodCode: 'text_to_image', mode: 'standard', resolution: '1024x1792', priceCents: 9.2 },
  { modelSlug: 'dall-e-3', methodCode: 'text_to_image', mode: 'standard', resolution: '1792x1024', priceCents: 9.2 },
  { modelSlug: 'dall-e-3', methodCode: 'text_to_image', mode: 'hd',       resolution: '1024x1024', priceCents: 9.2 },
  { modelSlug: 'dall-e-3', methodCode: 'text_to_image', mode: 'hd',       resolution: '1024x1792', priceCents: 13.8 },
  { modelSlug: 'dall-e-3', methodCode: 'text_to_image', mode: 'hd',       resolution: '1792x1024', priceCents: 13.8 },

  // dall-e-2 — no quality dim (mode=null)
  { modelSlug: 'dall-e-2', methodCode: 'text_to_image', mode: null, resolution: '256x256',   priceCents: 1.84 },
  { modelSlug: 'dall-e-2', methodCode: 'text_to_image', mode: null, resolution: '512x512',   priceCents: 2.07 },
  { modelSlug: 'dall-e-2', methodCode: 'text_to_image', mode: null, resolution: '1024x1024', priceCents: 2.30 },
  { modelSlug: 'dall-e-2', methodCode: 'image_edit',     mode: null, resolution: '256x256',   priceCents: 1.84 },
  { modelSlug: 'dall-e-2', methodCode: 'image_edit',     mode: null, resolution: '512x512',   priceCents: 2.07 },
  { modelSlug: 'dall-e-2', methodCode: 'image_edit',     mode: null, resolution: '1024x1024', priceCents: 2.30 },
];

async function seedOpenAIImagePrices(tariffId: string): Promise<void> {
  let count = 0;
  for (const spec of OPENAI_IMAGE_PRICES) {
    const bundleMethod = methodCodeToBundleMethod(spec.methodCode);
    const bundleKey = buildBundleKey({
      providerSlug: 'openai_image',
      modelSlug: spec.modelSlug,
      method: bundleMethod,
      mode: spec.mode,
      resolution: spec.resolution,
      durationSeconds: null,
      aspectRatio: null,
    });
    const bundle = await prisma.bundle.upsert({
      where: { bundleKey },
      create: {
        bundleKey,
        providerSlug: 'openai_image',
        modelSlug: spec.modelSlug,
        method: bundleMethod,
        mode: spec.mode,
        resolution: spec.resolution,
        unit: BundleUnit.PER_REQUEST,
        isActive: true,
      },
      update: {},
    });
    const priceUnits = BigInt(Math.round(spec.priceCents * Number(CENTS_TO_NANO)));
    await prisma.tariffBundlePrice.upsert({
      where: { tariffId_bundleId: { tariffId, bundleId: bundle.id } },
      create: { tariffId, bundleId: bundle.id, basePriceUnits: priceUnits },
      update: { basePriceUnits: priceUnits },
    });
    count++;
  }
  console.log(`[seed] openai-image tariff prices upserted: ${count}`);
}

async function seedOpenAIImageProviderAccount(): Promise<void> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.log('[seed] OPENAI_API_KEY not set — skipping OpenAI Image ProviderAccount');
    return;
  }
  const provider = await prisma.provider.findUnique({ where: { code: 'openai_image' } });
  if (!provider) {
    console.warn('[seed] provider openai_image not found — skipping account');
    return;
  }
  const existing = await prisma.providerAccount.findFirst({
    where: { providerId: provider.id, name: 'env-account' },
  });
  if (existing) {
    await prisma.providerAccount.update({
      where: { id: existing.id },
      data: {
        credentials: { apiKey } as Prisma.InputJsonValue,
        status: ProviderAccountStatus.ACTIVE,
      },
    });
    console.log(`[seed] openai-image env-account refreshed: ${existing.id}`);
    return;
  }
  const acc = await prisma.providerAccount.create({
    data: {
      providerId: provider.id,
      name: 'env-account',
      description: 'Auto-seeded from OPENAI_API_KEY env var',
      credentials: { apiKey } as Prisma.InputJsonValue,
      status: ProviderAccountStatus.ACTIVE,
      rotationEnabled: true,
      maxConcurrentTasks: 5,
    },
  });
  console.log(`[seed] openai-image env-account created: ${acc.id}`);
}

async function main(): Promise<void> {
  await seedSuperAdmin();
  await seedCatalog();
  const tariffId = await seedDefaultTariff();
  await seedBananaPrices(tariffId);
  await seedGoogleTextPrices(tariffId);
  await rescopeBananaAccounts();
  await seedBananaProviderAccount();
  await seedVeoPrices(tariffId);
  await seedVeoProviderAccount();
  await seedKlingPrices(tariffId);
  await seedKlingProviderAccount();
  await seedSeedancePrices(tariffId);
  await seedSeedanceProviderAccount();
  await seedOpenRouterPrices(tariffId);
  await seedOpenRouterProviderAccount();
  await seedOpenAIImagePrices(tariffId);
  await seedOpenAIImageProviderAccount();
}

main()
  .catch((err) => {
    console.error('[seed] failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
