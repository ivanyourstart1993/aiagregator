import { Injectable } from '@nestjs/common';
import {
  type ProviderAccount,
  ProviderAccountStatus,
} from '@aiagg/db';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class AccountSelectorService {
  constructor(private readonly prisma: PrismaService) {}

  async pickAccount(
    providerId: string,
    modelId: string,
    methodId: string,
    excludeIds: string[] = [],
  ): Promise<ProviderAccount | null> {
    const candidates = await this.prisma.providerAccount.findMany({
      where: {
        providerId,
        status: ProviderAccountStatus.ACTIVE,
        rotationEnabled: true,
        ...(excludeIds.length > 0 ? { id: { notIn: excludeIds } } : {}),
      },
      orderBy: { createdAt: 'asc' },
    });
    for (const acc of candidates) {
      if (
        acc.supportedModelIds.length > 0 &&
        !acc.supportedModelIds.includes(modelId)
      ) {
        continue;
      }
      if (
        acc.supportedMethodIds.length > 0 &&
        !acc.supportedMethodIds.includes(methodId)
      ) {
        continue;
      }
      return acc;
    }
    return null;
  }
}
