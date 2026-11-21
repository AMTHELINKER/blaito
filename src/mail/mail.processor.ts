import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { createTransport, Transporter } from 'nodemailer';
import { APP_CONFIG, AppConfig } from '../config/configuration';
import { MAIL_QUEUE, MailJob } from './mail.types';

@Processor(MAIL_QUEUE)
export class MailProcessor extends WorkerHost {
  private readonly logger = new Logger(MailProcessor.name);
  private readonly transport?: Transporter;

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {
    super();
    const { host, port, user, pass } = config.mail;
    if (host) {
      this.transport = createTransport({
        host,
        port,
        secure: port === 465,
        auth: user ? { user, pass } : undefined,
      });
    }
  }

  async process(job: Job<MailJob>): Promise<void> {
    const { to, subject, text, html } = job.data;
    if (!this.transport) {
      // Pas de SMTP configuré : on affiche l'e-mail (développement).
      this.logger.log(`\n✉️  À : ${to}\n   Objet : ${subject}\n   ${text}\n`);
      return;
    }
    await this.transport.sendMail({ from: this.config.mail.from, to, subject, text, html });
  }
}
