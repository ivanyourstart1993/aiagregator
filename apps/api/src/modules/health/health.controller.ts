import { Controller, Get } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';

@Controller()
export class HealthController {
  @Public()
  @Get('health')
  health() {
    return { status: 'ok', service: 'api', timestamp: new Date().toISOString() };
  }

  @Public()
  @Get('ready')
  ready() {
    return { status: 'ready', service: 'api' };
  }
}
