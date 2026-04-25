import { Injectable } from '@nestjs/common';
import {
  AvailabilityScope,
  CatalogStatus,
  type Method,
  type Model,
  Prisma,
  type Provider,
} from '@aiagg/db';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  CatalogEntityInUseError,
  CatalogEntityNotFoundError,
} from '../../common/errors/catalog.errors';
import { CatalogService } from './catalog.service';
import type {
  CreateProviderDto,
  UpdateProviderDto,
} from './dto/provider.dto';
import type { CreateModelDto, UpdateModelDto } from './dto/model.dto';
import type {
  CreateMethodDto,
  SetAvailabilityDto,
  UpdateMethodDto,
} from './dto/method.dto';

@Injectable()
export class AdminCatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: CatalogService,
  ) {}

  // ---- Providers --------------------------------------------------------

  async listProviders(filter: {
    status?: CatalogStatus;
    page?: number;
    pageSize?: number;
  }): Promise<{ items: Provider[]; total: number; page: number; pageSize: number }> {
    const page = Math.max(filter.page ?? 1, 1);
    const pageSize = Math.min(Math.max(filter.pageSize ?? 50, 1), 200);
    const where = filter.status ? { status: filter.status } : {};
    const [items, total] = await Promise.all([
      this.prisma.provider.findMany({
        where,
        orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.provider.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async getProvider(id: string): Promise<Provider> {
    const p = await this.prisma.provider.findUnique({ where: { id } });
    if (!p) throw new CatalogEntityNotFoundError('provider', id);
    return p;
  }

  async createProvider(dto: CreateProviderDto): Promise<Provider> {
    return this.prisma.provider.create({
      data: {
        code: dto.code,
        publicName: dto.publicName,
        description: dto.description ?? null,
        status: dto.status ?? CatalogStatus.ACTIVE,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
  }

  async updateProvider(id: string, dto: UpdateProviderDto): Promise<Provider> {
    await this.getProvider(id);
    return this.prisma.provider.update({
      where: { id },
      data: {
        publicName: dto.publicName,
        description: dto.description,
        status: dto.status,
        sortOrder: dto.sortOrder,
      },
    });
  }

  async deleteProvider(id: string): Promise<{ deleted: true }> {
    await this.getProvider(id);
    const modelCount = await this.prisma.model.count({ where: { providerId: id } });
    if (modelCount > 0) {
      throw new CatalogEntityInUseError(
        'provider',
        id,
        `provider has ${modelCount} model(s)`,
      );
    }
    await this.prisma.provider.delete({ where: { id } });
    return { deleted: true };
  }

  // ---- Models -----------------------------------------------------------

  async listModels(providerId: string): Promise<Model[]> {
    await this.getProvider(providerId);
    return this.prisma.model.findMany({
      where: { providerId },
      orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
    });
  }

  async getModel(id: string): Promise<Model> {
    const m = await this.prisma.model.findUnique({ where: { id } });
    if (!m) throw new CatalogEntityNotFoundError('model', id);
    return m;
  }

  async createModel(providerId: string, dto: CreateModelDto): Promise<Model> {
    await this.getProvider(providerId);
    return this.prisma.model.create({
      data: {
        providerId,
        code: dto.code,
        publicName: dto.publicName,
        description: dto.description ?? null,
        status: dto.status ?? CatalogStatus.ACTIVE,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
  }

  async updateModel(id: string, dto: UpdateModelDto): Promise<Model> {
    await this.getModel(id);
    return this.prisma.model.update({
      where: { id },
      data: {
        publicName: dto.publicName,
        description: dto.description,
        status: dto.status,
        sortOrder: dto.sortOrder,
      },
    });
  }

  async deleteModel(id: string): Promise<{ deleted: true }> {
    await this.getModel(id);
    const methodCount = await this.prisma.method.count({ where: { modelId: id } });
    if (methodCount > 0) {
      throw new CatalogEntityInUseError(
        'model',
        id,
        `model has ${methodCount} method(s)`,
      );
    }
    await this.prisma.model.delete({ where: { id } });
    return { deleted: true };
  }

  // ---- Methods ----------------------------------------------------------

  async listMethods(modelId: string): Promise<Method[]> {
    await this.getModel(modelId);
    return this.prisma.method.findMany({
      where: { modelId },
      orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
    });
  }

  async getMethod(
    id: string,
  ): Promise<Method & { provider: Provider; model: Model }> {
    const m = await this.prisma.method.findUnique({
      where: { id },
      include: { provider: true, model: true },
    });
    if (!m) throw new CatalogEntityNotFoundError('method', id);
    return m;
  }

  async createMethod(
    modelId: string,
    dto: CreateMethodDto,
  ): Promise<Method> {
    const model = await this.getModel(modelId);
    this.catalog.validateSchemaIsJsonSchema(dto.parametersSchema);
    return this.prisma.method.create({
      data: {
        providerId: model.providerId,
        modelId: model.id,
        code: dto.code,
        publicName: dto.publicName,
        description: dto.description ?? null,
        parametersSchema: dto.parametersSchema as Prisma.InputJsonValue,
        exampleRequest:
          dto.exampleRequest === undefined || dto.exampleRequest === null
            ? Prisma.JsonNull
            : (dto.exampleRequest as Prisma.InputJsonValue),
        exampleResponse:
          dto.exampleResponse === undefined || dto.exampleResponse === null
            ? Prisma.JsonNull
            : (dto.exampleResponse as Prisma.InputJsonValue),
        supportsSync: dto.supportsSync ?? false,
        supportsAsync: dto.supportsAsync ?? true,
        availability: dto.availability ?? AvailabilityScope.ALL_USERS,
        availabilityUserIds: dto.availabilityUserIds ?? [],
        status: dto.status ?? CatalogStatus.ACTIVE,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
  }

  async updateMethod(id: string, dto: UpdateMethodDto): Promise<Method> {
    await this.getMethod(id);
    if (dto.parametersSchema !== undefined) {
      this.catalog.validateSchemaIsJsonSchema(dto.parametersSchema);
    }
    const updated = await this.prisma.method.update({
      where: { id },
      data: {
        publicName: dto.publicName,
        description: dto.description,
        parametersSchema:
          dto.parametersSchema !== undefined
            ? (dto.parametersSchema as Prisma.InputJsonValue)
            : undefined,
        exampleRequest:
          dto.exampleRequest === undefined
            ? undefined
            : dto.exampleRequest === null
              ? Prisma.JsonNull
              : (dto.exampleRequest as Prisma.InputJsonValue),
        exampleResponse:
          dto.exampleResponse === undefined
            ? undefined
            : dto.exampleResponse === null
              ? Prisma.JsonNull
              : (dto.exampleResponse as Prisma.InputJsonValue),
        supportsSync: dto.supportsSync,
        supportsAsync: dto.supportsAsync,
        status: dto.status,
        sortOrder: dto.sortOrder,
      },
    });
    this.catalog.invalidateMethodCache(id);
    return updated;
  }

  async setAvailability(
    id: string,
    dto: SetAvailabilityDto,
  ): Promise<Method> {
    await this.getMethod(id);
    const updated = await this.prisma.method.update({
      where: { id },
      data: {
        availability: dto.scope,
        availabilityUserIds:
          dto.scope === AvailabilityScope.WHITELIST ? (dto.userIds ?? []) : [],
      },
    });
    this.catalog.invalidateMethodCache(id);
    return updated;
  }

  async deleteMethod(id: string): Promise<{ deleted: true }> {
    await this.getMethod(id);
    await this.prisma.method.delete({ where: { id } });
    this.catalog.invalidateMethodCache(id);
    return { deleted: true };
  }
}
