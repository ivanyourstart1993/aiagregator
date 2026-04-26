import { Global, Module } from '@nestjs/common';
import { SystemSettingsService } from './system-settings.service';
import { AdminSettingsController } from './admin-settings.controller';
import { AdminLoadController } from './admin-load.controller';

@Global()
@Module({
  controllers: [AdminSettingsController, AdminLoadController],
  providers: [SystemSettingsService],
  exports: [SystemSettingsService],
})
export class SystemSettingsModule {}
