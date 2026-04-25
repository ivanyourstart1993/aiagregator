import { Module } from '@nestjs/common';
import { PricingModule } from '../pricing/pricing.module';
import { AdminCatalogController } from './admin-catalog.controller';
import { AdminCatalogService } from './admin-catalog.service';
import { BundleSpecService } from './bundle-spec.service';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';

@Module({
  imports: [PricingModule],
  controllers: [CatalogController, AdminCatalogController],
  providers: [CatalogService, AdminCatalogService, BundleSpecService],
  exports: [CatalogService, BundleSpecService],
})
export class CatalogModule {}
