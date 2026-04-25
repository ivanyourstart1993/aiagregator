import { Injectable, Logger } from '@nestjs/common';
import {
  AvailabilityScope,
  CatalogStatus,
  type Method,
  type Model,
  type Provider,
} from '@aiagg/db';
import Ajv, { type ErrorObject, type ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  InvalidParametersError,
  InvalidParametersSchemaError,
  MethodNotAvailableForUserError,
  UnsupportedMethodError,
  UnsupportedModelError,
  UnsupportedProviderError,
} from '../../common/errors/catalog.errors';
import type {
  AdminMethodView,
  MethodView,
  ModelView,
  ProviderView,
} from './dto/views';

interface ResolvedTriple {
  provider: Provider;
  model: Model;
  method: Method;
}

@Injectable()
export class CatalogService {
  private readonly logger = new Logger(CatalogService.name);
  private readonly ajv: Ajv;
  private readonly metaValidator: ValidateFunction;
  private readonly compiledByMethod = new Map<string, ValidateFunction>();
  private readonly compiledSchemaSig = new Map<string, string>();

  constructor(private readonly prisma: PrismaService) {
    this.ajv = new Ajv({
      allErrors: true,
      strict: false,
      useDefaults: false,
      removeAdditional: false,
    });
    addFormats(this.ajv);
    this.metaValidator = this.ajv.getSchema(
      'http://json-schema.org/draft-07/schema#',
    ) as ValidateFunction;
  }

  // ---------------------------------------------------------------------
  // Views
  // ---------------------------------------------------------------------

  toProviderView(p: Provider): ProviderView {
    return {
      id: p.id,
      code: p.code,
      publicName: p.publicName,
      description: p.description,
      status: p.status,
      sortOrder: p.sortOrder,
    };
  }

  toModelView(m: Model & { provider?: Provider }): ModelView {
    return {
      id: m.id,
      providerId: m.providerId,
      providerCode: m.provider?.code ?? '',
      code: m.code,
      publicName: m.publicName,
      description: m.description,
      status: m.status,
      sortOrder: m.sortOrder,
    };
  }

  toMethodView(
    m: Method & { provider?: Provider; model?: Model },
  ): MethodView {
    return {
      id: m.id,
      providerId: m.providerId,
      providerCode: m.provider?.code ?? '',
      modelId: m.modelId,
      modelCode: m.model?.code ?? '',
      code: m.code,
      publicName: m.publicName,
      description: m.description,
      parametersSchema: (m.parametersSchema ?? {}) as Record<string, unknown>,
      exampleRequest: m.exampleRequest ?? null,
      exampleResponse: m.exampleResponse ?? null,
      supportsSync: m.supportsSync,
      supportsAsync: m.supportsAsync,
      availability: m.availability,
      status: m.status,
      sortOrder: m.sortOrder,
    };
  }

  toAdminMethodView(
    m: Method & { provider?: Provider; model?: Model },
  ): AdminMethodView {
    return {
      ...this.toMethodView(m),
      availabilityUserIds: m.availabilityUserIds,
    };
  }

  // ---------------------------------------------------------------------
  // Public read
  // ---------------------------------------------------------------------

  async listProviders(
    options: { includeDisabled?: boolean } = {},
  ): Promise<Provider[]> {
    return this.prisma.provider.findMany({
      where: options.includeDisabled
        ? undefined
        : { status: CatalogStatus.ACTIVE },
      orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
    });
  }

  /**
   * Public list of methods. Filters by ACTIVE status on Provider/Model/Method
   * and by availability (ALL_USERS or WHITELIST containing userId).
   */
  async listPublicMethods(
    userId?: string,
    filter: { providerCode?: string; modelCode?: string } = {},
  ): Promise<MethodView[]> {
    const methods = await this.prisma.method.findMany({
      where: {
        status: CatalogStatus.ACTIVE,
        provider: {
          status: CatalogStatus.ACTIVE,
          ...(filter.providerCode ? { code: filter.providerCode } : {}),
        },
        model: {
          status: CatalogStatus.ACTIVE,
          ...(filter.modelCode ? { code: filter.modelCode } : {}),
        },
      },
      include: { provider: true, model: true },
      orderBy: [
        { provider: { sortOrder: 'asc' } },
        { model: { sortOrder: 'asc' } },
        { sortOrder: 'asc' },
        { code: 'asc' },
      ],
    });

    return methods
      .filter((m) => this.isAvailableForUser(m, userId ?? null))
      .map((m) => this.toMethodView(m));
  }

  async getPublicMethod(
    providerCode: string,
    modelCode: string,
    methodCode: string,
    userId?: string,
  ): Promise<MethodView> {
    const { provider, model, method } = await this.resolveByCode(
      providerCode,
      modelCode,
      methodCode,
    );
    if (
      provider.status !== CatalogStatus.ACTIVE ||
      model.status !== CatalogStatus.ACTIVE ||
      method.status !== CatalogStatus.ACTIVE
    ) {
      throw new UnsupportedMethodError(methodCode);
    }
    if (!this.isAvailableForUser(method, userId ?? null)) {
      throw new MethodNotAvailableForUserError(method.id, userId ?? null);
    }
    return this.toMethodView({ ...method, provider, model });
  }

  // ---------------------------------------------------------------------
  // Resolve by code
  // ---------------------------------------------------------------------

  async resolveByCode(
    providerCode: string,
    modelCode: string,
    methodCode: string,
  ): Promise<ResolvedTriple> {
    const provider = await this.prisma.provider.findUnique({
      where: { code: providerCode },
    });
    if (!provider) throw new UnsupportedProviderError(providerCode);

    const model = await this.prisma.model.findUnique({
      where: { providerId_code: { providerId: provider.id, code: modelCode } },
    });
    if (!model) throw new UnsupportedModelError(modelCode);

    const method = await this.prisma.method.findUnique({
      where: {
        providerId_modelId_code: {
          providerId: provider.id,
          modelId: model.id,
          code: methodCode,
        },
      },
    });
    if (!method) throw new UnsupportedMethodError(methodCode);

    return { provider, model, method };
  }

  isAvailableForUser(method: Method, userId: string | null): boolean {
    if (method.availability === AvailabilityScope.ALL_USERS) return true;
    if (!userId) return false;
    return method.availabilityUserIds.includes(userId);
  }

  assertAvailableForUser(method: Method, userId: string | null): void {
    if (!this.isAvailableForUser(method, userId)) {
      throw new MethodNotAvailableForUserError(method.id, userId);
    }
  }

  /**
   * Combined helper used by Stage 6 admit: resolve by codes, ensure all entities
   * are ACTIVE, then check availability for the given user.
   */
  async resolveAndCheck(
    providerCode: string,
    modelCode: string,
    methodCode: string,
    userId: string | null,
  ): Promise<ResolvedTriple> {
    const triple = await this.resolveByCode(providerCode, modelCode, methodCode);
    if (triple.provider.status !== CatalogStatus.ACTIVE) {
      throw new UnsupportedProviderError(providerCode);
    }
    if (triple.model.status !== CatalogStatus.ACTIVE) {
      throw new UnsupportedModelError(modelCode);
    }
    if (triple.method.status !== CatalogStatus.ACTIVE) {
      throw new UnsupportedMethodError(methodCode);
    }
    this.assertAvailableForUser(triple.method, userId);
    return triple;
  }

  // ---------------------------------------------------------------------
  // Ajv validation
  // ---------------------------------------------------------------------

  validateSchemaIsJsonSchema(schema: unknown): void {
    if (!schema || typeof schema !== 'object') {
      throw new InvalidParametersSchemaError([
        { message: 'parametersSchema must be an object' },
      ]);
    }
    const ok = this.metaValidator(schema);
    if (!ok) {
      throw new InvalidParametersSchemaError(
        (this.metaValidator.errors ?? []) as ErrorObject[],
      );
    }
    // Try to compile to catch keyword-level errors not flagged by metaschema.
    try {
      this.ajv.compile(schema as Record<string, unknown>);
    } catch (e) {
      throw new InvalidParametersSchemaError([
        { message: e instanceof Error ? e.message : String(e) },
      ]);
    }
  }

  /**
   * Validate request params against the method's parametersSchema. Compiled
   * validators are cached per Method; cache is invalidated when the schema's
   * signature (Method.updatedAt + id) changes.
   */
  validateParams(
    method: Method,
    params: unknown,
  ): { ok: boolean; errors?: ErrorObject[] } {
    const sig = `${method.id}:${method.updatedAt.toISOString()}`;
    const cachedSig = this.compiledSchemaSig.get(method.id);
    let validator = this.compiledByMethod.get(method.id);
    if (!validator || cachedSig !== sig) {
      try {
        validator = this.ajv.compile(
          (method.parametersSchema ?? {}) as Record<string, unknown>,
        );
      } catch (e) {
        this.logger.warn(
          `Failed to compile parametersSchema for method ${method.id}: ${
            e instanceof Error ? e.message : String(e)
          }`,
        );
        return {
          ok: false,
          errors: [
            {
              instancePath: '',
              schemaPath: '',
              keyword: 'schema',
              params: {},
              message:
                e instanceof Error ? e.message : 'Failed to compile parametersSchema',
            } as ErrorObject,
          ],
        };
      }
      this.compiledByMethod.set(method.id, validator);
      this.compiledSchemaSig.set(method.id, sig);
    }
    const ok = validator(params) as boolean;
    return ok ? { ok: true } : { ok: false, errors: validator.errors ?? [] };
  }

  validateParamsOrThrow(method: Method, params: unknown): void {
    const result = this.validateParams(method, params);
    if (!result.ok) {
      throw new InvalidParametersError(result.errors ?? []);
    }
  }

  invalidateMethodCache(methodId: string): void {
    this.compiledByMethod.delete(methodId);
    this.compiledSchemaSig.delete(methodId);
  }
}
