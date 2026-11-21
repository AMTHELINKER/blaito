/**
 * Critères d'acceptation des user stories du MVP (cahier des charges §15).
 * Nécessite PostgreSQL (migrations appliquées) et Redis : `pnpm db:up && pnpm migration:run`.
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { MailService } from '../src/mail/mail.service';
import { setupApp } from '../src/setup-app';
import { FakeMail } from './support';

const run = Date.now().toString(36);
const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

describe('MVP Laito (e2e)', () => {
  let app: INestApplication;
  const mail = new FakeMail();
  const api = () => request(app.getHttpServer());

  /** Inscrit, vérifie et connecte un utilisateur ; renvoie son jeton d'accès et son cookie. */
  async function signUp(name: string) {
    const email = `${name}-${run}@test.laito`;
    const username = `${name}_${run}`;
    await api()
      .post('/api/v1/auth/register')
      .send({ email, password: 'motdepasse', username })
      .expect(201);
    const res = await api()
      .post('/api/v1/auth/verify-email')
      .send({ token: mail.last(email, 'verify') })
      .expect(200);
    return {
      email,
      username,
      id: res.body.user.id as string,
      token: res.body.accessToken as string,
      cookie: res.headers['set-cookie'] as unknown as string[],
    };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MailService)
      .useValue(mail)
      .compile();
    app = moduleRef.createNestApplication();
    await setupApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  describe('Créer un compte avec mon e-mail', () => {
    const email = `alice-${run}@test.laito`;

    it('refuse un mot de passe de moins de 8 caractères', async () => {
      await api()
        .post('/api/v1/auth/register')
        .send({ email, password: 'court', username: `alice_${run}` })
        .expect(400);
    });

    it('envoie un e-mail de vérification et bloque la connexion tant qu’il n’est pas vérifié', async () => {
      await api()
        .post('/api/v1/auth/register')
        .send({ email, password: 'motdepasse', username: `alice_${run}` })
        .expect(201);
      expect(mail.last(email, 'verify')).toBeDefined();

      const blocked = await api()
        .post('/api/v1/auth/login')
        .send({ email, password: 'motdepasse' })
        .expect(403);
      expect(blocked.body.error).toBe('EMAIL_NOT_VERIFIED');

      await api()
        .post('/api/v1/auth/verify-email')
        .send({ token: mail.last(email, 'verify') })
        .expect(200);
      const ok = await api()
        .post('/api/v1/auth/login')
        .send({ email, password: 'motdepasse' })
        .expect(200);
      expect(ok.body.accessToken).toBeTruthy();
      expect(ok.headers['set-cookie']?.[0]).toMatch(/laito_rt=.*HttpOnly/i);
    });

    it('fait tourner le refresh token et refuse sa réutilisation', async () => {
      const login = await api()
        .post('/api/v1/auth/login')
        .send({ email, password: 'motdepasse' })
        .expect(200);
      const cookie = login.headers['set-cookie'] as unknown as string[];
      const refreshed = await api().post('/api/v1/auth/refresh').set('Cookie', cookie).expect(200);
      expect(refreshed.body.user.email).toBe(email);
      // Réutiliser l'ancien jeton invalide la session.
      await api().post('/api/v1/auth/refresh').set('Cookie', cookie).expect(401);
      await api()
        .post('/api/v1/auth/refresh')
        .set('Cookie', refreshed.headers['set-cookie'] as unknown as string[])
        .expect(401);
    });

    it('réinitialise le mot de passe', async () => {
      await api().post('/api/v1/auth/forgot-password').send({ email }).expect(200);
      await api()
        .post('/api/v1/auth/reset-password')
        .send({ token: mail.last(email, 'reset'), password: 'nouveaumdp' })
        .expect(200);
      await api().post('/api/v1/auth/login').send({ email, password: 'nouveaumdp' }).expect(200);
    });
  });

  describe('Écriture, partage et lecture', () => {
    let author: Awaited<ReturnType<typeof signUp>>;
    let reader: Awaited<ReturnType<typeof signUp>>;
    let bookId: string;
    let chapters: string[] = [];
    const auth = (u: { token: string }) => ({ Authorization: `Bearer ${u.token}` });

    beforeAll(async () => {
      author = await signUp('auteur');
      reader = await signUp('lecteur');
    });

    it('crée un livre privé par défaut, visible dans ma bibliothèque', async () => {
      const res = await api()
        .post('/api/v1/books')
        .set(auth(author))
        .send({ title: 'Les Jardins de Sel', summary: 'Un conte', genre: 'fantasy', tags: ['mer'] })
        .expect(201);
      bookId = res.body.id;
      expect(res.body.visibility).toBe('private');
      expect(res.body.status).toBe('draft');
      const mine = await api().get('/api/v1/books/mine').set(auth(author)).expect(200);
      expect(mine.body.map((b: { id: string }) => b.id)).toContain(bookId);
    });

    it('accepte une couverture PNG et refuse un autre format', async () => {
      const ok = await api()
        .post(`/api/v1/books/${bookId}/cover`)
        .set(auth(author))
        .attach('file', PNG_1PX, 'cover.png')
        .expect(201);
      expect(ok.body.coverUrl).toMatch(/\/uploads\/covers\/.+\.png$/);
      await api()
        .post(`/api/v1/books/${bookId}/cover`)
        .set(auth(author))
        .attach('file', Buffer.from('GIF89a....'), 'cover.gif')
        .expect(400);
    });

    it('ajoute et réorganise les chapitres en une requête, ordre conservé', async () => {
      for (const title of ['Un', 'Deux', 'Trois']) {
        const r = await api()
          .post(`/api/v1/books/${bookId}/chapters`)
          .set(auth(author))
          .send({ title })
          .expect(201);
        chapters.push(r.body.id);
      }
      const reordered = [chapters[2], chapters[0], chapters[1]];
      await api()
        .put(`/api/v1/books/${bookId}/chapters/order`)
        .set(auth(author))
        .send({ chapterIds: reordered })
        .expect(200);
      const list = await api()
        .get(`/api/v1/books/${bookId}/chapters`)
        .set(auth(author))
        .expect(200);
      expect(list.body.map((c: { id: string }) => c.id)).toEqual(reordered);
      chapters = reordered;
    });

    it('enregistre le texte et met à jour le compteur de mots', async () => {
      const saved = await api()
        .put(`/api/v1/chapters/${chapters[0]}/content`)
        .set(auth(author))
        .send({ content: 'Il était **une** fois.\n\nLa mer montait.', baseVersion: 0 })
        .expect(200);
      expect(saved.body.version).toBe(1);
      const content = await api()
        .get(`/api/v1/chapters/${chapters[0]}/content`)
        .set(auth(author))
        .expect(200);
      expect(content.body.content).toContain('**une**');
      const list = await api()
        .get(`/api/v1/books/${bookId}/chapters`)
        .set(auth(author))
        .expect(200);
      expect(list.body[0].wordCount).toBe(7);
    });

    it("renvoie 404 à un non-autorisé (l'existence n'est pas révélée)", async () => {
      await api().get(`/api/v1/read/books/${bookId}`).expect(404);
      await api().get(`/api/v1/read/books/${bookId}`).set(auth(reader)).expect(404);
      await api().get(`/api/v1/books/${bookId}`).set(auth(reader)).expect(404);
      await api()
        .put(`/api/v1/chapters/${chapters[0]}/content`)
        .set(auth(reader))
        .send({ content: 'x' })
        .expect(404);
    });

    it('rend le livre public : chapitres non brouillons lisibles par tous', async () => {
      await api()
        .patch(`/api/v1/books/${bookId}`)
        .set(auth(author))
        .send({ visibility: 'public', status: 'in_progress' })
        .expect(200);
      for (const id of chapters) {
        await api()
          .patch(`/api/v1/chapters/${id}`)
          .set(auth(author))
          .send({ visibility: 'public' })
          .expect(200);
      }
      await api()
        .patch(`/api/v1/chapters/${chapters[0]}`)
        .set(auth(author))
        .send({ status: 'published' })
        .expect(200);
      const read = await api().get(`/api/v1/read/books/${bookId}`).expect(200);
      expect(read.body.chapters.map((c: { id: string }) => c.id)).toEqual([chapters[0]]);
      const chapter = await api().get(`/api/v1/read/chapters/${chapters[0]}`).expect(200);
      expect(chapter.body.content).toContain('La mer montait.');
      await api().get(`/api/v1/read/chapters/${chapters[1]}`).expect(404); // brouillon
      const catalog = await api().get('/api/v1/catalog?q=Jardins').expect(200);
      expect(catalog.body.items.map((b: { id: string }) => b.id)).toContain(bookId);
    });

    it('« amis » : réservé aux amis acceptés', async () => {
      await api()
        .patch(`/api/v1/books/${bookId}`)
        .set(auth(author))
        .send({ visibility: 'friends' })
        .expect(200);
      await api()
        .patch(`/api/v1/chapters/${chapters[0]}`)
        .set(auth(author))
        .send({ visibility: 'friends' })
        .expect(200);
      await api().get(`/api/v1/read/books/${bookId}`).set(auth(reader)).expect(404);
      await api().post(`/api/v1/friends/${author.username}`).set(auth(reader)).expect(201);
      await api().get(`/api/v1/read/books/${bookId}`).set(auth(reader)).expect(404); // demande en attente
      await api().post(`/api/v1/friends/${reader.username}`).set(auth(author)).expect(201); // acceptation
      await api().get(`/api/v1/read/chapters/${chapters[0]}`).set(auth(reader)).expect(200);
      await api().delete(`/api/v1/friends/${reader.id}`).set(auth(author)).expect(204);
      await api().get(`/api/v1/read/books/${bookId}`).set(auth(reader)).expect(404);
    });

    it('partage un lien privé unique, avec expiration optionnelle, révocable', async () => {
      await api()
        .patch(`/api/v1/books/${bookId}`)
        .set(auth(author))
        .send({ visibility: 'private' })
        .expect(200);
      const link = await api()
        .post('/api/v1/share/links')
        .set(auth(author))
        .send({
          resourceType: 'book',
          resourceId: bookId,
          expiresAt: new Date(Date.now() + 86400_000).toISOString(),
        })
        .expect(201);
      const token = link.body.token as string;
      expect(link.body.url).toContain(`/s/${token}`);
      // Créer un lien sur un livre privé le passe en « lien privé ».
      const book = await api().get(`/api/v1/books/${bookId}`).set(auth(author)).expect(200);
      expect(book.body.visibility).toBe('link');
      await api()
        .patch(`/api/v1/chapters/${chapters[0]}`)
        .set(auth(author))
        .send({ visibility: 'link' })
        .expect(200);

      const resolved = await api().get(`/api/v1/share/resolve/${token}`).expect(200);
      expect(resolved.body.bookId).toBe(bookId);
      await api().get(`/api/v1/read/chapters/${chapters[0]}?share=${token}`).expect(200);
      await api().get(`/api/v1/read/chapters/${chapters[0]}`).expect(404);

      await api().delete(`/api/v1/share/links/${link.body.id}`).set(auth(author)).expect(204);
      await api().get(`/api/v1/share/resolve/${token}`).expect(404);
      await api().get(`/api/v1/read/chapters/${chapters[0]}?share=${token}`).expect(404);
    });

    it('invite un lecteur précis, puis retire l’invitation', async () => {
      const grant = await api()
        .post('/api/v1/share/grants')
        .set(auth(author))
        .send({ resourceType: 'book', resourceId: bookId, username: reader.username })
        .expect(201);
      await api().get(`/api/v1/read/chapters/${chapters[0]}`).set(auth(reader)).expect(200);
      const withMe = await api().get('/api/v1/share/with-me').set(auth(reader)).expect(200);
      expect(withMe.body.map((b: { id: string }) => b.id)).toContain(bookId);
      await api().delete(`/api/v1/share/grants/${grant.body.id}`).set(auth(author)).expect(204);
      await api().get(`/api/v1/read/chapters/${chapters[0]}`).set(auth(reader)).expect(404);
    });

    it('retient les préférences de lecture sur le compte (tous appareils)', async () => {
      await api()
        .patch('/api/v1/me/settings')
        .set(auth(reader))
        .send({ readingPreferences: { theme: 'night', fontSize: 22, fontFamily: 'lora' } })
        .expect(200);
      // Nouvelle session = autre appareil.
      const other = await api()
        .post('/api/v1/auth/login')
        .send({ email: reader.email, password: 'motdepasse' })
        .expect(200);
      expect(other.body.user.settings.readingPreferences).toMatchObject({
        theme: 'night',
        fontSize: 22,
        fontFamily: 'lora',
        justify: true,
      });
    });

    it('reprend la lecture au bon paragraphe', async () => {
      await api()
        .patch(`/api/v1/books/${bookId}`)
        .set(auth(author))
        .send({ visibility: 'public' })
        .expect(200);
      await api()
        .patch(`/api/v1/chapters/${chapters[0]}`)
        .set(auth(author))
        .send({ visibility: 'public' })
        .expect(200);
      await api()
        .put('/api/v1/read/progress')
        .set(auth(reader))
        .send({ bookId, chapterId: chapters[0], position: 1 })
        .expect(200);
      const read = await api().get(`/api/v1/read/books/${bookId}`).set(auth(reader)).expect(200);
      expect(read.body.progress).toMatchObject({ chapterId: chapters[0], position: 1 });
      const list = await api().get('/api/v1/read/progress').set(auth(reader)).expect(200);
      expect(list.body[0].book.id).toBe(bookId);
    });

    it('supprime le livre (douce) puis le restaure', async () => {
      await api().delete(`/api/v1/books/${bookId}`).set(auth(author)).expect(204);
      await api().get(`/api/v1/read/books/${bookId}`).expect(404);
      await api().post(`/api/v1/books/${bookId}/restore`).set(auth(author)).expect(200);
      await api().get(`/api/v1/read/books/${bookId}`).expect(200);
    });

    it('exporte puis supprime le compte et ses données (RGPD)', async () => {
      const exp = await api().get('/api/v1/me/export').set(auth(author)).expect(200);
      expect(exp.body.writing[0].chapters.length).toBe(3);
      await api().delete('/api/v1/me').set(auth(author)).send({ password: 'mauvais' }).expect(400);
      await api()
        .delete('/api/v1/me')
        .set(auth(author))
        .send({ password: 'motdepasse' })
        .expect(204);
      await api().get(`/api/v1/read/books/${bookId}`).expect(404);
      await api()
        .post('/api/v1/auth/login')
        .send({ email: author.email, password: 'motdepasse' })
        .expect(401);
    });
  });
});
