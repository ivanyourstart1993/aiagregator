import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { OutreachAccountStatus, Prisma, UserRole } from '@aiagg/db';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { LogAdminAction } from '../../common/decorators/log-admin-action.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';

interface ApiCredentialsInput {
  apiId?: number;
  apiHash?: string;
}

function maskAccount(a: {
  id: string;
  name: string;
  phone: string;
  proxyId: string | null;
  status: OutreachAccountStatus;
  dailyLimit: number;
  todaySent: number;
  warmupStartedAt: Date;
  totalSent: number;
  lastSentAt: Date | null;
  lastErrorAt: Date | null;
  lastErrorMessage: string | null;
  sessionString: string | null;
  apiCredentials: Prisma.JsonValue;
  createdAt: Date;
  updatedAt: Date;
  proxy?: { id: string; name: string; host: string; country: string | null } | null;
}) {
  const creds = (a.apiCredentials ?? {}) as ApiCredentialsInput;
  return {
    id: a.id,
    name: a.name,
    phone: a.phone,
    proxyId: a.proxyId,
    proxy: a.proxy ?? null,
    status: a.status,
    dailyLimit: a.dailyLimit,
    todaySent: a.todaySent,
    warmupStartedAt: a.warmupStartedAt,
    totalSent: a.totalSent,
    lastSentAt: a.lastSentAt,
    lastErrorAt: a.lastErrorAt,
    lastErrorMessage: a.lastErrorMessage,
    hasSession: Boolean(a.sessionString),
    apiId: creds.apiId ?? null,
    apiHashMasked: creds.apiHash
      ? `${creds.apiHash.slice(0, 4)}…${creds.apiHash.slice(-4)}`
      : null,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  };
}

@Controller('internal/admin/crm/outreach-accounts')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class CrmOutreachAccountsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list() {
    const items = await this.prisma.outreachAccount.findMany({
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      include: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
    });
    // Fetch proxies in a 2nd query because Prisma relation isn't declared
    // (we keep proxyId as a soft FK to avoid a tighter coupling).
    const proxyIds = items.map((i) => i.proxyId).filter((x): x is string => Boolean(x));
    const proxies =
      proxyIds.length > 0
        ? await this.prisma.proxy.findMany({
            where: { id: { in: proxyIds } },
            select: { id: true, name: true, host: true, country: true },
          })
        : [];
    const byId = new Map(proxies.map((p) => [p.id, p]));
    return {
      items: items.map((a) =>
        maskAccount({ ...a, proxy: a.proxyId ? byId.get(a.proxyId) ?? null : null }),
      ),
    };
  }

  @Get(':id')
  async getOne(@Param('id') id: string) {
    const a = await this.prisma.outreachAccount.findUnique({ where: { id } });
    if (!a) throw new NotFoundException({ code: 'account_not_found' });
    const proxy = a.proxyId
      ? await this.prisma.proxy.findUnique({
          where: { id: a.proxyId },
          select: { id: true, name: true, host: true, country: true },
        })
      : null;
    return maskAccount({ ...a, proxy });
  }

  @Post()
  @LogAdminAction({ action: 'crm.outreach_account.create', targetType: 'outreach_account' })
  async create(
    @Body()
    body: {
      name: string;
      phone: string;
      apiId: number;
      apiHash: string;
      proxyId?: string | null;
      dailyLimit?: number;
    },
  ) {
    if (!body?.name?.trim() || !body?.phone?.trim()) {
      throw new BadRequestException('name and phone required');
    }
    if (!body.apiId || !body.apiHash?.trim()) {
      throw new BadRequestException('apiId and apiHash required (from my.telegram.org)');
    }
    const dailyLimit =
      typeof body.dailyLimit === 'number' && body.dailyLimit > 0 ? body.dailyLimit : 20;
    try {
      const a = await this.prisma.outreachAccount.create({
        data: {
          name: body.name.trim(),
          phone: body.phone.trim(),
          apiCredentials: { apiId: body.apiId, apiHash: body.apiHash } as Prisma.InputJsonValue,
          proxyId: body.proxyId ?? null,
          dailyLimit,
          status: 'WARMING',
        },
      });
      return maskAccount({ ...a, proxy: null });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new BadRequestException('phone already registered');
      }
      throw e;
    }
  }

  @Patch(':id')
  @LogAdminAction({ action: 'crm.outreach_account.update', targetType: 'outreach_account', targetIdFrom: 'params.id' })
  async update(
    @Param('id') id: string,
    @Body()
    body: {
      name?: string;
      proxyId?: string | null;
      dailyLimit?: number;
      status?: OutreachAccountStatus;
    },
  ) {
    const existing = await this.prisma.outreachAccount.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException({ code: 'account_not_found' });
    const data: Prisma.OutreachAccountUpdateInput = {};
    if (body.name !== undefined) data.name = body.name;
    if (body.proxyId !== undefined) data.proxyId = body.proxyId;
    if (body.dailyLimit !== undefined) data.dailyLimit = body.dailyLimit;
    if (body.status !== undefined) {
      if (!(Object.values(OutreachAccountStatus) as string[]).includes(body.status)) {
        throw new BadRequestException('invalid status');
      }
      data.status = body.status;
    }
    const updated = await this.prisma.outreachAccount.update({ where: { id }, data });
    return maskAccount({ ...updated, proxy: null });
  }

  @Delete(':id')
  @LogAdminAction({ action: 'crm.outreach_account.delete', targetType: 'outreach_account', targetIdFrom: 'params.id' })
  async remove(@Param('id') id: string) {
    try {
      await this.prisma.outreachAccount.delete({ where: { id } });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
        throw new NotFoundException({ code: 'account_not_found' });
      }
      throw e;
    }
    return { ok: true };
  }
}
