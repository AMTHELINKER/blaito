import { Inject, Injectable, Logger } from '@nestjs/common';
import { createTransport, Transporter } from 'nodemailer';
import { APP_CONFIG, AppConfig } from '../config/configuration';
import type { MailJob } from './mail.types';

export const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';

/** « Laito <no-reply@laito.fr> » → { name, email } (ou une adresse seule). */
export function parseAddress(from: string): { name?: string; email: string } {
  const m = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(from);
  if (m) return { name: m[1].trim() || undefined, email: m[2].trim() };
  return { email: from.trim() };
}

export type MailChannel = 'brevo-api' | 'smtp' | 'log';

/**
 * Envoi effectif d'un e-mail, par ordre de préférence :
 *  1. API HTTP de Brevo (BREVO_API_KEY) — HTTPS, fonctionne là où le SMTP sortant est bloqué
 *     (Render gratuit bloque les ports 25, 465 et 587) ;
 *  2. SMTP (SMTP_HOST) — pratique en local ou avec Mailpit ;
 *  3. sinon, affichage dans les logs (développement).
 */
@Injectable()
export class MailSender {
  private readonly logger = new Logger(MailSender.name);
  private readonly transport?: Transporter;
  readonly channel: MailChannel;

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {
    const { brevoApiKey, host, port, user, pass } = config.mail;
    if (brevoApiKey) {
      this.channel = 'brevo-api';
    } else if (host) {
      this.channel = 'smtp';
      this.transport = createTransport({
        host,
        port,
        secure: port === 465,
        auth: user ? { user, pass } : undefined,
        // Connexions réutilisées : on évite une poignée de main TLS + authentification par e-mail.
        pool: true,
        maxConnections: 2,
      });
    } else {
      this.channel = 'log';
    }
  }

  async send(job: MailJob): Promise<string | undefined> {
    if (this.channel === 'brevo-api') return this.sendWithBrevoApi(job);
    if (this.channel === 'smtp') {
      const info = await this.transport!.sendMail({ from: this.config.mail.from, ...job });
      return info.messageId;
    }
    this.logger.log(`\n✉️  À : ${job.to}\n   Objet : ${job.subject}\n   ${job.text}\n`);
    return undefined;
  }

  private async sendWithBrevoApi({
    to,
    subject,
    text,
    html,
  }: MailJob): Promise<string | undefined> {
    const res = await fetch(BREVO_API_URL, {
      method: 'POST',
      headers: {
        'api-key': this.config.mail.brevoApiKey!,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        sender: parseAddress(this.config.mail.from),
        to: [{ email: to }],
        subject,
        htmlContent: html,
        textContent: text,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const body = (await res.json().catch(() => ({}))) as {
      messageId?: string;
      message?: string;
      code?: string;
    };
    if (!res.ok) {
      throw new Error(
        `API Brevo ${res.status}${body.code ? ` ${body.code}` : ''} : ${body.message ?? res.statusText}`,
      );
    }
    return body.messageId;
  }
}
