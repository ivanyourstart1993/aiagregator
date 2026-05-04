// Public read-only site config — exposes a curated subset of SystemSetting
// values that the web layout needs on every render (including for anonymous
// visitors). Sits behind the /internal/* internal-service-secret middleware
// like the rest of the API, but does NOT require an admin JWT.
import { Controller, Get } from '@nestjs/common';
import { SystemSettingsService } from './system-settings.service';

interface GtmConfig {
  containerId: string | null;
  enabled: boolean;
}

interface SiteConfig {
  gtm: GtmConfig;
}

@Controller('internal/site-config')
export class SiteConfigController {
  constructor(private readonly settings: SystemSettingsService) {}

  @Get()
  async get(): Promise<SiteConfig> {
    const raw = await this.settings.get<unknown>('gtm', null);
    const gtm = normalizeGtm(raw);
    return { gtm };
  }
}

function normalizeGtm(raw: unknown): GtmConfig {
  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    const idCandidate = typeof obj.containerId === 'string' ? obj.containerId.trim() : '';
    const containerId = /^GTM-[A-Z0-9]+$/i.test(idCandidate) ? idCandidate.toUpperCase() : null;
    const enabled = obj.enabled === true && containerId !== null;
    return { containerId, enabled };
  }
  return { containerId: null, enabled: false };
}
