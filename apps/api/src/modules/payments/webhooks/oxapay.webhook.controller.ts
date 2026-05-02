import {
  BadRequestException,
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Req,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentProvider as PaymentProviderEnum } from '@aiagg/db';
import { isIpAllowed } from '@aiagg/shared';
import type { Request } from 'express';
import { Public } from '../../../common/decorators/public.decorator';
import { DepositService } from '../deposit.service';

/**
 * OxaPay webhook receiver.
 *
 * Registered with `express.raw({ type: '*\/*' })` in main.ts so that req.body
 * arrives as a Buffer for HMAC-SHA512 verification over the exact bytes.
 */
@Public()
@Controller('webhooks')
export class OxapayWebhookController {
  private readonly logger = new Logger(OxapayWebhookController.name);

  constructor(
    private readonly deposits: DepositService,
    private readonly config: ConfigService,
  ) {}

  @Post('oxapay')
  @HttpCode(HttpStatus.OK)
  async receive(@Req() req: Request): Promise<{ ok: boolean; reason?: string }> {
    // IP allowlist (optional). See comment in cryptomus.webhook.controller.ts:
    // we now trust only `req.ip` (resolved by Express via `trust proxy`),
    // never raw XFF, and use exact / CIDR matching.
    const allowlist = (this.config.get<string>('OXAPAY_IP_ALLOWLIST') ?? '').trim();
    if (allowlist.length > 0) {
      const subject = (req.ip ?? '').trim();
      if (!isIpAllowed(subject, allowlist)) {
        this.logger.warn(`OxaPay webhook from disallowed IP: ${subject}`);
        throw new BadRequestException({ message: 'forbidden_ip' });
      }
    }

    let raw: string;
    if (Buffer.isBuffer(req.body)) {
      raw = req.body.toString('utf8');
    } else if (typeof req.body === 'string') {
      raw = req.body;
    } else if (req.body && typeof req.body === 'object') {
      raw = JSON.stringify(req.body);
    } else {
      throw new BadRequestException({ message: 'empty_body' });
    }

    const headers = Object.fromEntries(
      Object.entries(req.headers).map(([k, v]) => [
        k.toLowerCase(),
        Array.isArray(v) ? v[0] ?? '' : (v ?? ''),
      ]),
    );
    const result = await this.deposits.handleWebhook(
      PaymentProviderEnum.OXAPAY,
      raw,
      headers,
    );
    if (!result.ok) {
      throw new BadRequestException({ message: result.reason ?? 'invalid_request' });
    }
    return result;
  }
}
