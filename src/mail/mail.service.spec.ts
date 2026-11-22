import { MailService } from './mail.service';
import type { MailSender } from './mail-sender';
import type { AppConfig } from '../config/configuration';

const config = { webOrigin: 'https://laito.test' } as AppConfig;

describe('MailService sans Redis', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('rend la main sans attendre la fin de l’envoi', async () => {
    let finish!: () => void;
    const sender = {
      send: jest.fn(() => new Promise<void>((r) => (finish = r))),
    } as unknown as MailSender;
    const mail = new MailService(config, sender);
    await mail.sendVerification('a@b.c', 'jeton'); // ne doit pas rester bloqué
    expect(sender.send).toHaveBeenCalledTimes(1);
    finish();
  });

  it('retente un envoi en échec, puis abandonne sans faire échouer la requête', async () => {
    const sender = {
      send: jest.fn().mockRejectedValue(new Error('SMTP indisponible')),
    } as unknown as MailSender;
    const mail = new MailService(config, sender);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(mail.sendPasswordReset('a@b.c', 'jeton')).resolves.toBeUndefined();
    await jest.runAllTimersAsync();
    expect(sender.send).toHaveBeenCalledTimes(3);
  });
});
