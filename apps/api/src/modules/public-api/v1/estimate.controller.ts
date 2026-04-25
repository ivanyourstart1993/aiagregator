import { Body, Controller, Post } from '@nestjs/common';
import { EstimateService } from '../services/estimate.service';
import { EstimateDto } from '../dto/estimate.dto';
import { PublicApi } from '../decorators/public-api.decorator';
import { CurrentApiCaller } from '../decorators/current-api-caller.decorator';
import type { AuthContext, EstimateResultView } from '../dto/views';

@Controller('v1/estimate')
export class EstimateController {
  constructor(private readonly service: EstimateService) {}

  @Post()
  @PublicApi()
  estimate(
    @CurrentApiCaller() auth: AuthContext,
    @Body() body: EstimateDto,
  ): Promise<EstimateResultView> {
    return this.service.estimate({ auth, body });
  }
}
