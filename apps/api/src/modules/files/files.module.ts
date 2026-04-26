import { Module } from '@nestjs/common';
import { AlertsModule } from '../alerts/alerts.module';
import { AdminFilesController } from './admin-files.controller';
import { FileCleanupCron } from './file-cleanup.cron';

@Module({
  imports: [AlertsModule],
  controllers: [AdminFilesController],
  providers: [FileCleanupCron],
})
export class FilesModule {}
