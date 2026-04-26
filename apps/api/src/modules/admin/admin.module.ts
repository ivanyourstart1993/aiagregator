import { Module } from '@nestjs/common';
import { AdminUsersController } from './admin-users.controller';
import { AdminDlqController } from './admin-dlq.controller';

@Module({
  controllers: [AdminUsersController, AdminDlqController],
})
export class AdminModule {}
