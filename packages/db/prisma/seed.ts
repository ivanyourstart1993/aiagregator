import {
  AvailabilityScope,
  CatalogStatus,
  Prisma,
  PrismaClient,
  UserRole,
  UserStatus,
} from '@prisma/client';
import * as argon2 from 'argon2';
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

async function main(): Promise<void> {
  await seedSuperAdmin();
  await seedCatalog();
}

main()
  .catch((err) => {
    console.error('[seed] failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
