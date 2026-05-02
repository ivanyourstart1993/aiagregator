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
 * Cryptomus webhook receiver.
 *
 * Note: this route is registered with `express.raw({ type: '*\/*' })` in
 * `main.ts` BEFORE the global JSON body-parser. The body therefore arrives as
 * a Buffer; we manually parse JSON for state-machine processing while keeping
 * the raw form for signature verification.
 */
@Public()
@Controller('webhooks')
export class CryptomusWebhookController {
  private readonly logger = new Logger(CryptomusWebhookController.name);

  constructor(
    private readonly deposits: DepositService,
    private readonly config: ConfigService,
  ) {}

  @Post('cryptomus')
  @HttpCode(HttpStatus.OK)
  async receive(@Req() req: Request): Promise<{ ok: boolean; reason?: string }> {
    // 1. IP allowlist (optional). Trust only `req.ip` — Express resolves
    //    this to the left-most-untrusted XFF entry once `app.set('trust
    //    proxy', N)` is configured (see main.ts). Manual XFF parsing was
    //    removed because the attacker controls header bytes; the previous
    //    `subject.includes(allowed)` substring match is replaced by strict
    //    equality with optional CIDR support via `isIpAllowed`.
    //
    //    HMAC verification still runs unconditionally below — the allowlist
    //    is defense-in-depth, not a substitute for signature checks.
    const allowlist = (this.config.get<string>('CRYPTOMUS_IP_ALLOWLIST') ?? '').trim();
    if (allowlist.length > 0) {
      const subject = (req.ip ?? '').trim();
      if (!isIpAllowed(subject, allowlist)) {
        this.logger.warn(`Cryptomus webhook from disallowed IP: ${subject}`);
        throw new BadRequestException({ message: 'forbidden_ip' });
      }
    }

    // 2. Extract raw body. With `express.raw()`, req.body is a Buffer.
    let raw: string;
    if (Buffer.isBuffer(req.body)) {
      raw = req.body.toString('utf8');
    } else if (typeof req.body === 'string') {
      raw = req.body;
    } else if (req.body && typeof req.body === 'object') {
      // Fallback (raw middleware not active for this route): re-stringify.
      raw = JSON.stringify(req.body);
    } else {
      throw new BadRequestException({ message: 'empty_body' });
    }

    const headers = Object.fromEntries(
      Object.entries(req.headers).map(([k, v]) => [k.toLowerCase(), Array.isArray(v) ? v[0] ?? '' : (v ?? '')]),
    );
    const result = await this.deposits.handleWebhook(
      PaymentProviderEnum.CRYPTOMUS,
      raw,
      headers,
    );
    if (!result.ok) {
      // Bad signature etc — return 400 so provider may retry.
      throw new BadRequestException({ message: result.reason ?? 'invalid_request' });
    }
    return result;
  }
}
