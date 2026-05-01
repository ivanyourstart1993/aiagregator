import {
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Logger,
  NotFoundException,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Readable } from 'node:stream';
import { Public } from '../../../common/decorators/public.decorator';
import { StorageService } from '../../../common/storage/storage.service';

/**
 * Public file proxy for result objects stored in MinIO.
 *
 * Why this exists: S3_ENDPOINT in production points at the cluster-internal
 * addon host (e.g. `minio.minio--XXXX.addon.code.run:9000`), which is not
 * resolvable from the public internet. Direct URLs returned to clients used
 * to be unreachable, so every successful generation looked broken from the
 * caller's perspective.
 *
 * This controller takes the path after `/v1/files/`, fetches the object from
 * the internal MinIO over cluster networking, and streams the bytes back.
 *
 * Auth: intentionally unauthenticated. The S3 bucket policy is already
 * `Allow GetObject Principal:*`, so adding API-key auth here would be a
 * pointless layer. Result keys embed user/task IDs, but they're unguessable
 * (cuid + random suffix in `buildResultKey`), so leakage requires the
 * presigned URL to leak first. Rate limiting belongs in the edge proxy.
 */
@Controller('v1/files')
@Public()
export class FilesController {
  private readonly logger = new Logger(FilesController.name);

  constructor(private readonly storage: StorageService) {}

  @Get('*')
  async download(
    @Req() req: Request,
    @Res({ passthrough: false }) res: Response,
  ): Promise<void> {
    // Express puts the wildcard match in req.params[0]. Strip leading
    // slashes; reject keys that try to escape the bucket via "../".
    const raw = (req.params as Record<string, string>)[0] ?? '';
    const key = raw.replace(/^\/+/, '');
    if (!key || key.includes('..') || key.startsWith('/')) {
      throw new NotFoundException('file not found');
    }

    let obj: Awaited<ReturnType<StorageService['getObject']>>;
    try {
      obj = await this.storage.getObject(key);
    } catch (err) {
      const status =
        (err as { $metadata?: { httpStatusCode?: number } }).$metadata
          ?.httpStatusCode ?? 0;
      if (status === 404 || status === 403) {
        throw new NotFoundException('file not found');
      }
      this.logger.error(
        `storage GetObject failed for key=${key}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      throw new HttpException(
        'storage_unavailable',
        HttpStatus.BAD_GATEWAY,
      );
    }

    const body = obj.Body;
    if (!body) {
      throw new NotFoundException('file not found');
    }

    if (obj.ContentType) res.setHeader('content-type', obj.ContentType);
    if (typeof obj.ContentLength === 'number') {
      res.setHeader('content-length', String(obj.ContentLength));
    }
    // Result files are immutable and named with random suffixes — long
    // cache is safe and offloads our proxy on retry storms.
    res.setHeader('cache-control', 'public, max-age=31536000, immutable');

    // AWS SDK v3 returns body as a Node Readable in Node runtimes. Pipe it.
    if (body instanceof Readable) {
      body.pipe(res);
    } else if (typeof (body as { transformToWebStream?: unknown })
      .transformToWebStream === 'function') {
      // Web stream fallback (Bun / edge): convert to Node Readable.
      const webStream = (
        body as { transformToWebStream: () => ReadableStream<Uint8Array> }
      ).transformToWebStream();
      Readable.fromWeb(webStream as never).pipe(res);
    } else {
      // Last resort: collect to buffer.
      const buf = Buffer.from(
        await (body as { transformToByteArray: () => Promise<Uint8Array> })
          .transformToByteArray(),
      );
      res.end(buf);
    }
  }
}
