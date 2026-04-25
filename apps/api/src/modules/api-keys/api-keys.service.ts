import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiKeyStatus } from '@aiagg/db';
import * as argon2 from 'argon2';
import { customAlphabet } from 'nanoid';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { AuthConfig } from '../../config/configuration';

const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const generatePrefix = customAlphabet(BASE62, 12);
const generateSecret = customAlphabet(BASE62, 24);

export interface ApiKeyView {
  id: string;
  name: string;
  prefix: string;
  last4: string;
  status: ApiKeyStatus;
  scopes: string[];
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
  masked: string;
}

export interface ApiKeyCreated extends ApiKeyView {
  plaintext: string;
}

function mask(prefix: string, last4: string): string {
  return `sk_live_${prefix}_••••••••${last4}`;
}

@Injectable()
export class ApiKeysService {
  private readonly pepper: string;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    const auth = config.get<AuthConfig>('auth');
    if (!auth) throw new Error('auth config namespace missing');
    this.pepper = auth.apiKeyPepper;
  }

  async list(userId: string): Promise<ApiKeyView[]> {
    const rows = await this.prisma.apiKey.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        prefix: true,
        last4: true,
        status: true,
        scopes: true,
        lastUsedAt: true,
        expiresAt: true,
        createdAt: true,
      },
    });
    return rows.map((r) => ({ ...r, masked: mask(r.prefix, r.last4) }));
  }

  async getOne(userId: string, id: string): Promise<ApiKeyView> {
    const row = await this.prisma.apiKey.findFirst({
      where: { id, userId },
      select: {
        id: true,
        name: true,
        prefix: true,
        last4: true,
        status: true,
        scopes: true,
        lastUsedAt: true,
        expiresAt: true,
        createdAt: true,
      },
    });
    if (!row) throw new NotFoundException('API key not found');
    return { ...row, masked: mask(row.prefix, row.last4) };
  }

  async generate(userId: string, name: string): Promise<ApiKeyCreated> {
    const prefix = generatePrefix();
    const secret = generateSecret();
    const last4 = secret.slice(-4);
    const hashedSecret = await argon2.hash(secret + this.pepper, {
      type: argon2.argon2id,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });

    const created = await this.prisma.apiKey.create({
      data: {
        userId,
        name,
        prefix,
        hashedSecret,
        last4,
      },
      select: {
        id: true,
        name: true,
        prefix: true,
        last4: true,
        status: true,
        scopes: true,
        lastUsedAt: true,
        expiresAt: true,
        createdAt: true,
      },
    });

    return {
      ...created,
      masked: mask(created.prefix, created.last4),
      plaintext: `sk_live_${prefix}_${secret}`,
    };
  }

  async revoke(userId: string, id: string): Promise<ApiKeyView> {
    const row = await this.prisma.apiKey.findFirst({ where: { id, userId } });
    if (!row) throw new NotFoundException('API key not found');
    const updated = await this.prisma.apiKey.update({
      where: { id },
      data: { status: ApiKeyStatus.REVOKED },
      select: {
        id: true,
        name: true,
        prefix: true,
        last4: true,
        status: true,
        scopes: true,
        lastUsedAt: true,
        expiresAt: true,
        createdAt: true,
      },
    });
    return { ...updated, masked: mask(updated.prefix, updated.last4) };
  }

  async delete(userId: string, id: string): Promise<{ ok: true }> {
    const row = await this.prisma.apiKey.findFirst({ where: { id, userId } });
    if (!row) throw new NotFoundException('API key not found');
    await this.prisma.apiKey.delete({ where: { id } });
    return { ok: true };
  }
}
