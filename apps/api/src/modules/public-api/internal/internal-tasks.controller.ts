import {
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { TaskStatus } from '@aiagg/db';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import {
  CurrentUser,
  type CurrentUserPayload,
} from '../../../common/decorators/current-user.decorator';
import { TasksService } from '../services/tasks.service';
import type { TaskView } from '../dto/views';

@Controller('internal/tasks')
@UseGuards(JwtAuthGuard)
export class InternalTasksController {
  constructor(private readonly tasks: TasksService) {}

  @Get()
  list(
    @CurrentUser() user: CurrentUserPayload,
    @Query('status') status?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query('pageSize', new DefaultValuePipe(50), ParseIntPipe) pageSize = 50,
  ): Promise<{
    items: TaskView[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const allowed = Object.values(TaskStatus) as string[];
    const filterStatus =
      status && allowed.includes(status) ? (status as TaskStatus) : undefined;
    return this.tasks.listForUser({
      userId: user.id,
      status: filterStatus,
      page,
      pageSize,
    });
  }

  @Get(':id')
  get(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
  ): Promise<TaskView> {
    return this.tasks.get(id, user.id);
  }
}
