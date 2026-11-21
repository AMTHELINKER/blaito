import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { APP_CONFIG, AppConfig } from '../config/configuration';
import { MailSender } from './mail-sender';
import { MAIL_QUEUE, MailJob } from './mail.types';

const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

function layout(title: string, body: string, cta: { label: string; url: string }): string {
  return `<!doctype html><html lang="fr"><body style="margin:0;background:#F3E9D7;font-family:Georgia,serif;color:#3E2A1E">
<div style="max-width:520px;margin:32px auto;padding:32px;background:#fffaf0;border:1px solid #E6D3B3;border-radius:16px">
<p style="font-size:28px;margin:0 0 16px">Laito</p>
<h1 style="font-size:20px;font-weight:normal">${escape(title)}</h1>
<p style="font-family:Arial,sans-serif;line-height:1.6">${escape(body)}</p>
<p><a href="${escape(cta.url)}" style="display:inline-block;padding:12px 20px;background:#8B5E3C;color:#fff;border-radius:10px;text-decoration:none;font-family:Arial,sans-serif">${escape(cta.label)}</a></p>
<p style="font-family:Arial,sans-serif;font-size:12px;color:#6b5443">Si le bouton ne fonctionne pas : ${escape(cta.url)}</p>
</div></body></html>`;
}

/** Les e-mails sont mis en file (BullMQ) si Redis est configuré, sinon envoyés directement. */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly sender: MailSender,
    @Optional() @InjectQueue(MAIL_QUEUE) private readonly queue?: Queue<MailJob>,
  ) {}

  async sendVerification(to: string, token: string): Promise<void> {
    const url = `${this.config.webOrigin}/verifier-email?token=${encodeURIComponent(token)}`;
    await this.enqueue({
      to,
      subject: 'Vérifiez votre adresse e-mail – Laito',
      text: `Bienvenue sur Laito ! Confirmez votre adresse : ${url}`,
      html: layout(
        'Bienvenue sur Laito',
        'Confirmez votre adresse e-mail pour commencer à écrire. Ce lien est valable 24 heures.',
        { label: 'Confirmer mon adresse', url },
      ),
    });
  }

  async sendPasswordReset(to: string, token: string): Promise<void> {
    const url = `${this.config.webOrigin}/reinitialiser-mot-de-passe?token=${encodeURIComponent(token)}`;
    await this.enqueue({
      to,
      subject: 'Réinitialisation du mot de passe – Laito',
      text: `Pour choisir un nouveau mot de passe : ${url} (valable 1 heure)`,
      html: layout(
        'Nouveau mot de passe',
        'Vous avez demandé à réinitialiser votre mot de passe. Ce lien est valable 1 heure. Si ce n’est pas vous, ignorez ce message.',
        { label: 'Choisir un mot de passe', url },
      ),
    });
  }

  protected async enqueue(job: MailJob): Promise<void> {
    if (!this.queue) {
      // Sans file : envoi direct. Un échec SMTP ne doit pas faire échouer l'inscription.
      await this.sender
        .send(job)
        .catch((err: Error) => this.logger.error(`E-mail non envoyé : ${err.message}`));
      return;
    }
    await this.queue.add('send', job, {
      attempts: 5,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: 1000,
      removeOnFail: 5000,
    });
  }
}
