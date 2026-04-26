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
    },
  });

  console.log(`[seed] super_admin upserted: id=${user.id} email=${user.email}`);
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
  priceCents: number;
}

// Prices per TZ §11.1
const BANANA_PRICES: BananaBundleSpec[] = [
  // Nano-2 (gemini-3.1-flash-image-preview) — text_to_image
  { modelSlug: 'gemini-3.1-flash-image-preview', methodCode: 'text_to_image', resolution: '0.5K', priceCents: 10 },
  { modelSlug: 'gemini-3.1-flash-image-preview', methodCode: 'text_to_image', resolution: '1K',   priceCents: 15 },
  { modelSlug: 'gemini-3.1-flash-image-preview', methodCode: 'text_to_image', resolution: '2K',   priceCents: 25 },
  { modelSlug: 'gemini-3.1-flash-image-preview', methodCode: 'text_to_image', resolution: '4K',   priceCents: 40 },
  // Nano-2 — image_edit / image_to_image (same prices)
  { modelSlug: 'gemini-3.1-flash-image-preview', methodCode: 'image_edit',     resolution: '0.5K', priceCents: 12 },
  { modelSlug: 'gemini-3.1-flash-image-preview', methodCode: 'image_edit',     resolution: '1K',   priceCents: 18 },
  { modelSlug: 'gemini-3.1-flash-image-preview', methodCode: 'image_edit',     resolution: '2K',   priceCents: 30 },
  { modelSlug: 'gemini-3.1-flash-image-preview', methodCode: 'image_edit',     resolution: '4K',   priceCents: 50 },
  { modelSlug: 'gemini-3.1-flash-image-preview', methodCode: 'image_to_image', resolution: '0.5K', priceCents: 12 },
  { modelSlug: 'gemini-3.1-flash-image-preview', methodCode: 'image_to_image', resolution: '1K',   priceCents: 18 },
  { modelSlug: 'gemini-3.1-flash-image-preview', methodCode: 'image_to_image', resolution: '2K',   priceCents: 30 },
  { modelSlug: 'gemini-3.1-flash-image-preview', methodCode: 'image_to_image', resolution: '4K',   priceCents: 50 },
  // Nano-2 — multi_reference_image
  { modelSlug: 'gemini-3.1-flash-image-preview', methodCode: 'multi_reference_image', resolution: '1K', priceCents: 25 },
  { modelSlug: 'gemini-3.1-flash-image-preview', methodCode: 'multi_reference_image', resolution: '2K', priceCents: 40 },
  { modelSlug: 'gemini-3.1-flash-image-preview', methodCode: 'multi_reference_image', resolution: '4K', priceCents: 65 },
  // Pro (gemini-3-pro-image-preview)
  { modelSlug: 'gemini-3-pro-image-preview', methodCode: 'text_to_image', resolution: '1K', priceCents: 35 },
  { modelSlug: 'gemini-3-pro-image-preview', methodCode: 'text_to_image', resolution: '2K', priceCents: 35 },
  { modelSlug: 'gemini-3-pro-image-preview', methodCode: 'text_to_image', resolution: '4K', priceCents: 65 },
  { modelSlug: 'gemini-3-pro-image-preview', methodCode: 'image_edit',     resolution: '1K', priceCents: 45 },
  { modelSlug: 'gemini-3-pro-image-preview', methodCode: 'image_edit',     resolution: '2K', priceCents: 45 },
  { modelSlug: 'gemini-3-pro-image-preview', methodCode: 'image_edit',     resolution: '4K', priceCents: 80 },
  { modelSlug: 'gemini-3-pro-image-preview', methodCode: 'image_to_image', resolution: '1K', priceCents: 45 },
  { modelSlug: 'gemini-3-pro-image-preview', methodCode: 'image_to_image', resolution: '2K', priceCents: 45 },
  { modelSlug: 'gemini-3-pro-image-preview', methodCode: 'image_to_image', resolution: '4K', priceCents: 80 },
  { modelSlug: 'gemini-3-pro-image-preview', methodCode: 'multi_reference_image', resolution: '1K', priceCents: 55 },
  { modelSlug: 'gemini-3-pro-image-preview', methodCode: 'multi_reference_image', resolution: '2K', priceCents: 55 },
  { modelSlug: 'gemini-3-pro-image-preview', methodCode: 'multi_reference_image', resolution: '4K', priceCents: 100 },
];

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
      aspectRatio: null,
    });
    const bundle = await prisma.bundle.upsert({
      where: { bundleKey },
      create: {
        bundleKey,
        providerSlug: 'google_banana',
        modelSlug: spec.modelSlug,
        method: bundleMethod,
        resolution: spec.resolution,
        unit: BundleUnit.PER_REQUEST,
        isActive: true,
      },
      update: {},
    });
    const priceUnits = BigInt(spec.priceCents) * CENTS_TO_NANO;
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
    const priceUnits = BigInt(spec.priceCents) * CENTS_TO_NANO;
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
  const cents = Math.round(usd * 100);
  return BigInt(cents) * 1_000_000n; // cents * 1e6 == USD * 1e8
}

interface VeoBundleSpec {
  modelSlug: string;
  methodCode: string;
  resolution: string;
  pricePerSecondUsd: number;
}

const VEO_PRICES: VeoBundleSpec[] = [
  // text_to_video
  { modelSlug: 'veo-3.0-generate-001',          methodCode: 'text_to_video', resolution: '720p',  pricePerSecondUsd: 0.75 },
  { modelSlug: 'veo-3.0-generate-001',          methodCode: 'text_to_video', resolution: '1080p', pricePerSecondUsd: 0.75 },
  { modelSlug: 'veo-3.0-fast-generate-001',     methodCode: 'text_to_video', resolution: '720p',  pricePerSecondUsd: 0.20 },
  { modelSlug: 'veo-3.0-fast-generate-001',     methodCode: 'text_to_video', resolution: '1080p', pricePerSecondUsd: 0.25 },
  { modelSlug: 'veo-3.0-fast-generate-001',     methodCode: 'text_to_video', resolution: '4K',    pricePerSecondUsd: 0.55 },
  { modelSlug: 'veo-3.1-generate-preview',      methodCode: 'text_to_video', resolution: '720p',  pricePerSecondUsd: 0.75 },
  { modelSlug: 'veo-3.1-generate-preview',      methodCode: 'text_to_video', resolution: '1080p', pricePerSecondUsd: 0.75 },
  { modelSlug: 'veo-3.1-generate-preview',      methodCode: 'text_to_video', resolution: '4K',    pricePerSecondUsd: 1.10 },
  { modelSlug: 'veo-3.1-fast-generate-preview', methodCode: 'text_to_video', resolution: '720p',  pricePerSecondUsd: 0.20 },
  { modelSlug: 'veo-3.1-fast-generate-preview', methodCode: 'text_to_video', resolution: '1080p', pricePerSecondUsd: 0.25 },
  { modelSlug: 'veo-3.1-fast-generate-preview', methodCode: 'text_to_video', resolution: '4K',    pricePerSecondUsd: 0.55 },
  { modelSlug: 'veo-3.1-lite-generate-preview', methodCode: 'text_to_video', resolution: '720p',  pricePerSecondUsd: 0.10 },
  { modelSlug: 'veo-3.1-lite-generate-preview', methodCode: 'text_to_video', resolution: '1080p', pricePerSecondUsd: 0.15 },
  // image_to_video (+~$0.05/s vs text_to_video)
  { modelSlug: 'veo-3.0-generate-001',          methodCode: 'image_to_video', resolution: '720p',  pricePerSecondUsd: 0.80 },
  { modelSlug: 'veo-3.0-generate-001',          methodCode: 'image_to_video', resolution: '1080p', pricePerSecondUsd: 0.80 },
  { modelSlug: 'veo-3.0-fast-generate-001',     methodCode: 'image_to_video', resolution: '720p',  pricePerSecondUsd: 0.25 },
  { modelSlug: 'veo-3.0-fast-generate-001',     methodCode: 'image_to_video', resolution: '1080p', pricePerSecondUsd: 0.30 },
  { modelSlug: 'veo-3.0-fast-generate-001',     methodCode: 'image_to_video', resolution: '4K',    pricePerSecondUsd: 0.65 },
  { modelSlug: 'veo-3.1-generate-preview',      methodCode: 'image_to_video', resolution: '720p',  pricePerSecondUsd: 0.80 },
  { modelSlug: 'veo-3.1-generate-preview',      methodCode: 'image_to_video', resolution: '1080p', pricePerSecondUsd: 0.80 },
  { modelSlug: 'veo-3.1-generate-preview',      methodCode: 'image_to_video', resolution: '4K',    pricePerSecondUsd: 1.20 },
  { modelSlug: 'veo-3.1-fast-generate-preview', methodCode: 'image_to_video', resolution: '720p',  pricePerSecondUsd: 0.25 },
  { modelSlug: 'veo-3.1-fast-generate-preview', methodCode: 'image_to_video', resolution: '1080p', pricePerSecondUsd: 0.30 },
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
}

main()
  .catch((err) => {
    console.error('[seed] failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
