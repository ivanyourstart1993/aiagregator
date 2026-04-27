import { Module } from '@nestjs/common';
import { SupportController } from './support.controller';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [MailModule],
  controllers: [SupportController],
})
export class SupportModule {}
