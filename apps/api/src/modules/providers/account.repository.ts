import { Injectable } from '@nestjs/common';
import {
  type ProviderAccount,
  ProviderAccountStatus,
} from '@aiagg/db';
import { PrismaService } from '../../common/prisma/prisma.service';

export type SwitchAccountReason =
  | 'provider_billing_error'
  | 'provider_quota_exhausted'
  | 'invalid_credentials'
  | 'limit_reached'
  | 'rate_limit'
  | 'temporary_error'
  | 'success'
  | 'unknown';

@Injectable()
export class AccountRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<ProviderAccount | null> {
    return this.prisma.providerAccount.findUnique({ where: { id } });
  }

  async markSuccess(id: string): Promise<void> {
    await this.prisma.providerAccount.update({
      where: { id },
      data: {
        lastSuccessAt: new Date(),
        todayRequestsCount: { increment: 1 },
        monthRequestsCount: { increment: 1 },
      },
    });
  }

  async markFailure(
    id: string,
    reason: SwitchAccountReason,
    message?: string,
  ): Promise<void> {
    let status: ProviderAccountStatus | undefined;
    switch (reason) {
      case 'provider_billing_error':
        status = ProviderAccountStatus.EXCLUDED_BY_BILLING;
        break;
      case 'provider_quota_exhausted':
        status = ProviderAccountStatus.QUOTA_EXHAUSTED;
        break;
      case 'invalid_credentials':
        status = ProviderAccountStatus.INVALID_CREDENTIALS;
        break;
      case 'limit_reached':
        status = ProviderAccountStatus.LIMIT_REACHED;
        break;
      default:
        status = undefined;
    }
    await this.prisma.providerAccount.update({
      where: { id },
      data: {
        lastErrorAt: new Date(),
        lastErrorMessage: message?.slice(0, 1000) ?? null,
        ...(status ? { status, excludedReason: reason } : {}),
      },
    });
  }
}
