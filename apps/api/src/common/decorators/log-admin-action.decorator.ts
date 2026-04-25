import { SetMetadata } from '@nestjs/common';

export const LOG_ADMIN_ACTION_KEY = 'logAdminAction';

export interface LogAdminActionMeta {
  action: string;
  targetType: string;
  /**
   * Path inside request (params/body/query) to extract targetId from.
   * e.g. 'params.id' or 'body.userId'.
   */
  targetIdFrom?: string;
}

export const LogAdminAction = (meta: LogAdminActionMeta): MethodDecorator =>
  SetMetadata(LOG_ADMIN_ACTION_KEY, meta);
