import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import { MailSender } from './mail-sender';
import { MailProcessor } from './mail.processor';
import { MailService } from './mail.service';
import { MAIL_QUEUE } from './mail.types';

/**
 * Avec Redis : les e-mails passent par une file BullMQ (réessais automatiques).
 * Sans Redis (hébergement gratuit) : ils sont envoyés directement.
 */
const withQueue = !!process.env.REDIS_URL;

@Global()
@Module({
  imports: withQueue ? [BullModule.registerQueue({ name: MAIL_QUEUE })] : [],
  providers: [MailService, MailSender, ...(withQueue ? [MailProcessor] : [])],
  exports: [MailService],
})
export class MailModule {}
