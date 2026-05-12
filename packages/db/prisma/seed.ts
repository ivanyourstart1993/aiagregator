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
  { modelSlug: 'kling-v3',  methodCode: 'text_to_video', mode: 'standard', durationSeconds: 5,  resolution: '720p',  priceCents: 140 },
  { modelSlug: 'kling-v3',  methodCode: 'text_to_video', mode: 'pro',      durationSeconds: 5,  resolution: '1080p', priceCents: 300 },
  { modelSlug: 'kling-v3',  methodCode: 'text_to_video', mode: 'pro',      durationSeconds: 10, resolution: '1080p', priceCents: 550 },
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
  // kling-v2-5-turbo (Kling 2.5 Turbo) — pro only
  { modelSlug: 'kling-v2-5-turbo', methodCode: 'text_to_video',  mode: 'pro', durationSeconds: 5,  resolution: '1080p', priceCents: 50 },
  { modelSlug: 'kling-v2-5-turbo', methodCode: 'text_to_video',  mode: 'pro', durationSeconds: 10, resolution: '1080p', priceCents: 90 },
  { modelSlug: 'kling-v2-5-turbo', methodCode: 'image_to_video', mode: 'pro', durationSeconds: 5,  resolution: '1080p', priceCents: 50 },
  { modelSlug: 'kling-v2-5-turbo', methodCode: 'image_to_video', mode: 'pro', durationSeconds: 10, resolution: '1080p', priceCents: 90 },
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
    console.log(`[seed] seedance env-account refreshed: ${existing.id}`);
    return;
  }
  const acc = await prisma.providerAccount.create({
    data: {
      providerId: provider.id,
      name: 'env-account',
      description: 'Auto-seeded from SEEDANCE_API_KEY env var',
      credentials: { apiKey } as Prisma.InputJsonValue,
      status: ProviderAccountStatus.ACTIVE,
      rotationEnabled: true,
      maxConcurrentTasks: 3,
    },
  });
  console.log(`[seed] seedance env-account created: ${acc.id}`);
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

const OPENAI_IMAGE_PRICES: OpenAIImageBundleSpec[] = [
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
  await seedBananaProviderAccount();
  await seedVeoPrices(tariffId);
  await seedVeoProviderAccount();
  await seedKlingPrices(tariffId);
  await seedKlingProviderAccount();
  await seedSeedancePrices(tariffId);
  await seedSeedanceProviderAccount();
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
