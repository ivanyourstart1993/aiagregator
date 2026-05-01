import {
  Controller,
  ForbiddenException,
  Get,
  Logger,
  NotFoundException,
  Param,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { StorageService } from '../../../common/storage/storage.service';
import { PublicApi } from '../decorators/public-api.decorator';
import { CurrentApiCaller } from '../decorators/current-api-caller.decorator';
import type { AuthContext } from '../dto/views';

/**
 * Streaming proxy for result files. The internal storage URL points at the
 * cluster-internal MinIO endpoint (`minio.minio--*.addon.code.run`), which
 * does not resolve from the public internet. Clients call this endpoint
 * with their API key, we authorise (file must belong to the caller), then
 * stream the object body from MinIO out to the response.
 *
 * The published URL is therefore `https://api.aigenway.com/v1/files/{id}`,
 * never an internal hostname.
 */
@Controller('v1/files')
export class FilesController {
  private readonly logger = new Logger(FilesController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  @Get(':id')
  @PublicApi()
  async download(
    @Param('id') id: string,
    @CurrentApiCaller() auth: AuthContext,
    @Res() res: Response,
  ): Promise<void> {
    const file = await this.prisma.resultFile.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        storageKey: true,
        storageBucket: true,
        mimeType: true,
        fileSize: true,
      },
    });
    if (!file) throw new NotFoundException({ code: 'file_not_found' });
    if (file.userId !== auth.user.id) {
      throw new ForbiddenException({ code: 'forbidden' });
    }

    let stream;
    try {
      stream = await this.storage.getObjectStream(file.storageKey);
    } catch (err) {
      const m = err instanceof Error ? err.message : String(err);
      this.logger.warn(`storage GET failed key=${file.storageKey}: ${m}`);
      throw new NotFoundException({ code: 'file_not_found' });
    }

    const ct = stream.contentType ?? file.mimeType ?? 'application/octet-stream';
    res.setHeader('Content-Type', ct);
    if (stream.contentLength !== undefined) {
      res.setHeader('Content-Length', String(stream.contentLength));
    } else if (file.fileSize) {
      res.setHeader('Content-Length', String(file.fileSize));
    }
    if (stream.etag) res.setHeader('ETag', stream.etag);
    // Result files are immutable for a given id — encourage CDN/browser caching.
    res.setHeader('Cache-Control', 'private, max-age=86400, immutable');

    stream.body.pipe(res);
    await new Promise<void>((resolve, reject) => {
      stream.body.on('end', () => resolve());
      stream.body.on('error', (err) => reject(err));
    }).catch((err) => {
      this.logger.warn(
        `stream interrupted key=${file.storageKey}: ${err instanceof Error ? err.message : String(err)}`,
      );
    });
  }
}
