import type { AppConfig } from '../config/configuration';
import { BREVO_API_URL, MailSender, parseAddress } from './mail-sender';

const job = { to: 'lea@exemple.fr', subject: 'Bienvenue', text: 'Texte', html: '<p>Texte</p>' };
const config = (mail: Partial<AppConfig['mail']>) =>
  ({ mail: { port: 587, from: 'Laito <laito.app@gmail.com>', ...mail } }) as AppConfig;

describe('MailSender', () => {
  afterEach(() => jest.restoreAllMocks());

  it('lit une adresse « Nom <e-mail> » ou une adresse seule', () => {
    expect(parseAddress('Laito <no-reply@laito.fr>')).toEqual({
      name: 'Laito',
      email: 'no-reply@laito.fr',
    });
    expect(parseAddress('"Laito" <no-reply@laito.fr>')).toEqual({
      name: 'Laito',
      email: 'no-reply@laito.fr',
    });
    expect(parseAddress('no-reply@laito.fr')).toEqual({ email: 'no-reply@laito.fr' });
  });

  it("préfère l'API HTTP de Brevo au SMTP quand une clé est fournie", async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ messageId: '<id@brevo>' }), { status: 201 }),
      );
    const sender = new MailSender(config({ brevoApiKey: 'cle', host: 'smtp-relay.brevo.com' }));
    expect(sender.channel).toBe('brevo-api');
    await expect(sender.send(job)).resolves.toBe('<id@brevo>');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(BREVO_API_URL);
    expect((init.headers as Record<string, string>)['api-key']).toBe('cle');
    expect(JSON.parse(init.body as string)).toMatchObject({
      sender: { name: 'Laito', email: 'laito.app@gmail.com' },
      to: [{ email: 'lea@exemple.fr' }],
      subject: 'Bienvenue',
      htmlContent: '<p>Texte</p>',
    });
  });

  it("remonte une erreur lisible quand l'API refuse l'envoi", async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ code: 'unauthorized', message: 'Key not found' }), {
        status: 401,
      }),
    );
    await expect(new MailSender(config({ brevoApiKey: 'mauvaise' })).send(job)).rejects.toThrow(
      'API Brevo 401 unauthorized : Key not found',
    );
  });

  it('sans clé ni SMTP, affiche simplement l’e-mail dans les logs', async () => {
    const sender = new MailSender(config({}));
    expect(sender.channel).toBe('log');
    await expect(sender.send(job)).resolves.toBeUndefined();
  });
});
