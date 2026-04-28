import { Module } from '@nestjs/common';
import { AdminUsersController } from './admin-users.controller';
import { AdminDlqController } from './admin-dlq.controller';
import { AdminTasksController } from './admin-tasks.controller';

@Module({
  controllers: [AdminUsersController, AdminDlqController, AdminTasksController],
})
export class AdminModule {}
