import { Module } from '@nestjs/common';
import { OutreachMailService } from './outreach-mail.service';
import { EmailCampaignsController } from './email-campaigns.controller';
import { EmailActionsController } from './email-actions.controller';
import { ResendOutreachWebhookController } from './resend-outreach-webhook.controller';
import { ResendInboundWebhookController } from './resend-inbound-webhook.controller';
import { UnsubscribeController } from './unsubscribe.controller';

@Module({
  providers: [OutreachMailService],
  controllers: [
    EmailCampaignsController,
    EmailActionsController,
    ResendOutreachWebhookController,
    ResendInboundWebhookController,
    UnsubscribeController,
  ],
  exports: [OutreachMailService],
})
export class CrmEmailModule {}
