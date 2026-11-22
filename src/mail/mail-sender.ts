import { Inject, Injectable, Logger } from '@nestjs/common';
import { createTransport, Transporter } from 'nodemailer';
import { APP_CONFIG, AppConfig } from '../config/configuration';
import type { MailJob } from './mail.types';

/** Envoi effectif d'un e-mail (SMTP), ou affichage dans les logs si aucun SMTP n'est configuré. */
@Injectable()
export class MailSender {
  private readonly logger = new Logger(MailSender.name);
  private readonly transport?: Transporter;

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {
    const { host, port, user, pass } = config.mail;
    if (host) {
      this.transport = createTransport({
        host,
        port,
        secure: port === 465,
        auth: user ? { user, pass } : undefined,
        // Connexions réutilisées : on évite une poignée de main TLS + authentification par e-mail.
        pool: true,
        maxConnections: 2,
      });
    }
  }

  async send({ to, subject, text, html }: MailJob): Promise<void> {
    if (!this.transport) {
      this.logger.log(`\n✉️  À : ${to}\n   Objet : ${subject}\n   ${text}\n`);
      return;
    }
    await this.transport.sendMail({ from: this.config.mail.from, to, subject, text, html });
  }
}
