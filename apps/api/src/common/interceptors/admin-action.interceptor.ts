import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  Logger,
  type NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Prisma } from '@aiagg/db';
import { type Observable, tap } from 'rxjs';
import type { Request } from 'express';
import {
  LOG_ADMIN_ACTION_KEY,
  type LogAdminActionMeta,
} from '../decorators/log-admin-action.decorator';
import type { CurrentUserPayload } from '../decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';

function pluck(req: Request, path: string | undefined): string | undefined {
  if (!path) return undefined;
  const segments = path.split('.');
  let cur: unknown = req;
  for (const seg of segments) {
    if (cur && typeof cur === 'object' && seg in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[seg];
    } else {
      return undefined;
    }
  }
  return typeof cur === 'string' ? cur : undefined;
}

@Injectable()
export class AdminActionInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AdminActionInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const meta = this.reflector.get<LogAdminActionMeta | undefined>(
      LOG_ADMIN_ACTION_KEY,
      context.getHandler(),
    );
    if (!meta) {
      return next.handle();
    }

    const req = context.switchToHttp().getRequest<
      Request & { user?: CurrentUserPayload }
    >();

    return next.handle().pipe(
      tap((response) => {
        const actor = req.user;
        if (!actor) return;

        const targetId =
          pluck(req, meta.targetIdFrom) ??
          (typeof response === 'object' && response && 'id' in response
            ? String((response as { id: unknown }).id)
            : 'unknown');

        const payload: Record<string, unknown> = {};
        if (req.body && typeof req.body === 'object') {
          payload.body = req.body;
        }

        this.prisma.adminAction
          .create({
            data: {
              actorId: actor.id,
              action: meta.action,
              targetType: meta.targetType,
              targetId,
              payload: payload as Prisma.InputJsonValue,
              ipAddress: req.ip ?? null,
              userAgent: req.headers['user-agent'] ?? null,
            },
          })
          .catch((err: unknown) => {
            const msg = err instanceof Error ? err.message : String(err);
            this.logger.error(`Failed to write AdminAction: ${msg}`);
          });
      }),
    );
  }
}
