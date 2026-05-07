import { Module } from '@nestjs/common';
import { CrmLeadsController } from './crm-leads.controller';
import { CrmSourcesController } from './crm-sources.controller';
import { CrmTemplatesController } from './crm-templates.controller';
import { CrmOutreachAccountsController } from './crm-outreach-accounts.controller';

@Module({
  controllers: [
    CrmLeadsController,
    CrmSourcesController,
    CrmTemplatesController,
    CrmOutreachAccountsController,
  ],
})
export class CrmModule {}
