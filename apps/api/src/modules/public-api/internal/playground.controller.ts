/**
 * Internal "playground" endpoint — lets a logged-in user submit a
 * generation from the dashboard without holding an API key. Reuses
 * GenerationsService.admit (the same code path /v1/generations uses)
 * so billing, anti-abuse, validation, and queueing behave identically;
 * only the auth surface differs (JwtAuthGuard ↔ PublicApiKeyGuard).
 */
import {
  BadRequestException,
  Body,
  Controller,
  PayloadTooLargeException,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { randomBytes } from 'node:crypto';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import {
  CurrentUser,
  type CurrentUserPayload,
} from '../../../common/decorators/current-user.decorator';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { StorageService } from '../../../common/storage/storage.service';
import { CreateGenerationDto } from '../dto/create-generation.dto';
import type { AuthContext } from '../dto/views';
import { GenerationsService } from '../services/generations.service';

const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

function extForMime(mime: string): string {
  switch (mime) {
    case 'image/jpeg':
      return '.jpg';
    case 'image/png':
      return '.png';
    case 'image/webp':
      return '.webp';
    case 'image/gif':
      return '.gif';
    default:
      return '';
  }
}

@Controller('internal/playground')
@UseGuards(JwtAuthGuard)
export class PlaygroundController {
  constructor(
    private readonly generations: GenerationsService,
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  /**
   * Accept a raw image body (registered via express.raw in main.ts) and
   * push it to MinIO under `playground/{userId}/...`. Returns a URL the
   * caller can pass back as `params.input_images[0]` for image_edit.
   */
  @Post('uploads')
  async upload(
    @CurrentUser() user: CurrentUserPayload,
    @Req() req: Request,
  ): Promise<{ url: string }> {
    const ctRaw = (req.headers['content-type'] ?? '').toString().toLowerCase();
    const ct = ctRaw.split(';')[0]?.trim() ?? '';
    if (!ALLOWED_MIME.has(ct)) {
      throw new BadRequestException(
        `unsupported content-type: ${ct || '(none)'}`,
      );
    }
    const body = req.body as unknown;
    if (!Buffer.isBuffer(body) || body.length === 0) {
      throw new BadRequestException('empty body');
    }
    if (body.length > MAX_UPLOAD_BYTES) {
      throw new PayloadTooLargeException('max upload size is 15MB');
    }
    const stamp = Date.now().toString(36);
    const rand = randomBytes(6).toString('hex');
    const key = `playground/${user.id}/${stamp}-${rand}${extForMime(ct)}`;
    const result = await this.storage.upload({
      key,
      body,
      contentType: ct,
      contentLength: body.length,
    });
    return { url: result.url };
  }

  @Post('generations')
  async submit(
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: CreateGenerationDto,
  ) {
    // We need a full AuthContext for GenerationsService — pull the
    // matching User row to fill in fields that the JWT payload doesn't
    // carry (rate-limit overrides, emailVerified, etc.).
    const u = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: {
        id: true, email: true, role: true, status: true, emailVerified: true,
        rateLimitPerMin: true, rateLimitPerDay: true,
        maxConcurrentTasks: true, maxRequestsPerDayPerUser: true,
      },
    });
    const auth: AuthContext = {
      user: {
        id: u!.id,
        email: u!.email,
        role: u!.role,
        status: u!.status,
        emailVerified: u!.emailVerified,
        rateLimitPerMin: u!.rateLimitPerMin,
        rateLimitPerDay: u!.rateLimitPerDay,
        maxConcurrentTasks: u!.maxConcurrentTasks,
        maxRequestsPerDayPerUser: u!.maxRequestsPerDayPerUser,
      },
      // Synthetic apiKey marker — provider attempt records will show
      // `playground` so we can audit / filter later.
      apiKey: { id: 'playground', userId: u!.id, prefix: 'playground' },
    };

    return this.generations.admit({
      auth,
      body,
      idempotencyKey: undefined,
    });
  }
}
