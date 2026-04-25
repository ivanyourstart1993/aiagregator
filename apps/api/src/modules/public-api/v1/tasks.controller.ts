import { Controller, Get, Param } from '@nestjs/common';
import { TasksService } from '../services/tasks.service';
import { PublicApi } from '../decorators/public-api.decorator';
import { CurrentApiCaller } from '../decorators/current-api-caller.decorator';
import type { AuthContext, TaskView } from '../dto/views';

@Controller('v1/tasks')
export class TasksController {
  constructor(private readonly service: TasksService) {}

  @Get(':id')
  @PublicApi()
  async get(
    @CurrentApiCaller() auth: AuthContext,
    @Param('id') id: string,
  ): Promise<{ success: true; task: TaskView }> {
    const task = await this.service.get(id, auth.user.id);
    return { success: true, task };
  }

  @Get(':id/result')
  @PublicApi()
  result(
    @CurrentApiCaller() auth: AuthContext,
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.service.getResult(id, auth.user.id);
  }
}
