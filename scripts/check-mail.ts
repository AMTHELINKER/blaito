/**
 * Envoie un e-mail de test avec le même code que l'application (API Brevo, SMTP ou logs).
 *
 *   pnpm mail:check vous@exemple.fr
 *   ENV_FILE=.env.production pnpm mail:check vous@exemple.fr
 */
import '../src/load-env';
import 'reflect-metadata';
import { loadConfig } from '../src/config/configuration';
import { MailSender } from '../src/mail/mail-sender';

async function main() {
  const to = process.argv[2];
  if (!to || !to.includes('@')) throw new Error('Usage : pnpm mail:check vous@exemple.fr');
  const config = loadConfig();
  const sender = new MailSender(config);
  const channels = {
    'brevo-api': 'API HTTP de Brevo (HTTPS)',
    smtp: `SMTP ${config.mail.host}:${config.mail.port}`,
    log: 'aucun (BREVO_API_KEY et SMTP_HOST vides : affichage dans les logs)',
  };
  console.log(`Canal : ${channels[sender.channel]} — expéditeur : ${config.mail.from}`);
  if (sender.channel === 'log') throw new Error('Aucun canal d’envoi configuré.');
  const id = await sender.send({
    to,
    subject: 'Test d’envoi – Laito',
    text: 'Si vous lisez ceci, les e-mails de Laito (vérification, mot de passe) sont prêts.',
    html: '<p>Si vous lisez ceci, les e-mails de <strong>Laito</strong> (vérification, mot de passe) sont prêts.</p>',
  });
  console.log(`\n✅ Accepté par Brevo${id ? ` (${id})` : ''}. Vérifiez la boîte de ${to}.`);
}

main().catch((err: Error) => {
  console.error(`\n❌ ${err.message}`);
  process.exit(1);
});
