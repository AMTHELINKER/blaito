import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { MailSender } from './mail-sender';
import { MAIL_QUEUE, MailJob } from './mail.types';

/** Consommateur de la file d'e-mails (mode avec Redis). */
@Processor(MAIL_QUEUE)
export class MailProcessor extends WorkerHost {
  constructor(private readonly sender: MailSender) {
    super();
  }

  async process(job: Job<MailJob>): Promise<void> {
    await this.sender.send(job.data);
  }
}
