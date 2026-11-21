/**
 * Envoie un e-mail de test avec la configuration SMTP (SMTP_*, MAIL_FROM).
 *
 *   pnpm mail:check vous@exemple.fr
 *
 * Les variables sont lues dans l'environnement ou dans le fichier .env (ou ENV_FILE).
 */
import '../src/load-env';
import 'reflect-metadata';
import { createTransport } from 'nodemailer';
import { loadConfig } from '../src/config/configuration';

async function main() {
  const to = process.argv[2];
  if (!to || !to.includes('@')) throw new Error('Usage : pnpm mail:check vous@exemple.fr');
  const { host, port, user, pass, from } = loadConfig().mail;
  if (!host)
    throw new Error('SMTP_HOST est vide : les e-mails ne seraient affichés que dans les logs.');
  const missing = Object.entries({ SMTP_USER: user, SMTP_PASS: pass, MAIL_FROM: from })
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (missing.length) throw new Error(`Variables manquantes : ${missing.join(', ')}`);

  console.log(`Serveur : ${host}:${port} — expéditeur : ${from}`);
  const transport = createTransport({ host, port, secure: port === 465, auth: { user, pass } });
  await transport.verify();
  console.log('1. Connexion et authentification SMTP : OK');
  const info = await transport.sendMail({
    from,
    to,
    subject: 'Test d’envoi – Laito',
    text: 'Si vous lisez ceci, les e-mails de Laito (vérification, mot de passe) sont prêts.',
  });
  console.log(`2. Envoi : OK (${info.messageId})`);
  console.log(`\n✅ E-mail envoyé à ${to}. Vérifiez la boîte de réception (et les indésirables).`);
}

main().catch((err: Error) => {
  console.error(`\n❌ ${err.message}`);
  process.exit(1);
});
