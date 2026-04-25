import { Injectable, type NestMiddleware } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { NextFunction, Request, Response } from 'express';
import { nanoid } from 'nanoid';

export interface RequestContext {
  requestId: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

export const REQUEST_ID_HEADER = 'x-request-id';

export function getRequestId(): string | undefined {
  return storage.getStore()?.requestId;
}

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const incoming = req.header(REQUEST_ID_HEADER);
    const requestId = incoming && incoming.length <= 128 ? incoming : `req_${nanoid(20)}`;
    res.setHeader(REQUEST_ID_HEADER, requestId);
    storage.run({ requestId }, () => {
      next();
    });
  }
}
