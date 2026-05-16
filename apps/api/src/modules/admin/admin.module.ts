import { Module } from '@nestjs/common';
import { AdminUsersController } from './admin-users.controller';
import { AdminDlqController } from './admin-dlq.controller';
import { AdminTasksController } from './admin-tasks.controller';
import { AdminErrorLogsController } from './admin-error-logs.controller';
import { ErrorLogRetentionCron } from './error-log-retention.cron';

@Module({
  controllers: [
    AdminUsersController,
    AdminDlqController,
    AdminTasksController,
    AdminErrorLogsController,
  ],
  providers: [ErrorLogRetentionCron],
})
export class AdminModule {}
