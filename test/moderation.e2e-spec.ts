/**
 * Modération : signalements, décisions, rôles. Nécessite PostgreSQL (migrations appliquées).
 */
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { User } from '../src/identity/entities/user.entity';
import { bearer, createTestApp, type TestUser } from './support';

describe('Modération (e2e)', () => {
  let app: INestApplication;
  let author: TestUser;
  let reader: TestUser;
  let mod: TestUser;
  let admin: TestUser;
  let bookId: string;
  const api = () => request(app.getHttpServer());

  /** Attribue un rôle directement en base (comme `pnpm user:role`) puis reconnecte. */
  async function promote(u: TestUser, role: 'moderator' | 'admin') {
    await app.get(DataSource).getRepository(User).update({ id: u.id }, { role });
    const res = await api()
      .post('/api/v1/auth/login')
      .send({ email: u.email, password: 'motdepasse' })
      .expect(200);
    u.token = res.body.accessToken;
  }

  let signUpExtra: (name: string) => Promise<TestUser>;

  beforeAll(async () => {
    const ctx = await createTestApp();
    app = ctx.app;
    signUpExtra = ctx.signUp;
    [author, reader, mod, admin] = await Promise.all(
      ['auteur', 'lecteur', 'modo', 'admin'].map((n) => ctx.signUp(n)),
    );
    await promote(mod, 'moderator');
    await promote(admin, 'admin');

    const book = await api()
      .post('/api/v1/books')
      .set(bearer(author))
      .send({ title: 'Livre douteux' })
      .expect(201);
    bookId = book.body.id;
    const ch = await api()
      .post(`/api/v1/books/${bookId}/chapters`)
      .set(bearer(author))
      .send({ title: 'Un' });
    await api()
      .put(`/api/v1/chapters/${ch.body.id}/content`)
      .set(bearer(author))
      .send({ content: 'Texte' });
    await api()
      .patch(`/api/v1/chapters/${ch.body.id}`)
      .set(bearer(author))
      .send({ status: 'published', visibility: 'public' });
    await api()
      .patch(`/api/v1/books/${bookId}`)
      .set(bearer(author))
      .send({ visibility: 'public', status: 'in_progress' });
  });

  afterAll(async () => {
    await app?.close();
  });

  it("l'administration est réservée aux modérateurs et administrateurs", async () => {
    await api().get('/api/v1/admin/stats').set(bearer(reader)).expect(403);
    const stats = await api().get('/api/v1/admin/stats').set(bearer(mod)).expect(200);
    expect(stats.body.users.total).toBeGreaterThanOrEqual(4);
  });

  it("on ne signale que ce que l'on peut voir, et pas son propre contenu", async () => {
    const privateBook = await api()
      .post('/api/v1/books')
      .set(bearer(author))
      .send({ title: 'Privé' });
    await api()
      .post('/api/v1/reports')
      .set(bearer(reader))
      .send({ targetType: 'book', targetId: privateBook.body.id, reason: 'spam' })
      .expect(404);
    await api()
      .post('/api/v1/reports')
      .set(bearer(author))
      .send({ targetType: 'book', targetId: bookId, reason: 'spam' })
      .expect(400);
  });

  it('signaler deux fois la même cible ne crée qu’un signalement ouvert', async () => {
    for (let i = 0; i < 2; i++) {
      await api()
        .post('/api/v1/reports')
        .set(bearer(reader))
        .send({
          targetType: 'book',
          targetId: bookId,
          reason: 'inappropriate',
          details: 'Propos choquants',
        })
        .expect(201);
    }
    const list = await api().get('/api/v1/admin/reports').set(bearer(mod)).expect(200);
    const mine = list.body.items.filter((r: { targetId: string }) => r.targetId === bookId);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({
      reason: 'inappropriate',
      details: 'Propos choquants',
      status: 'open',
    });
    expect(mine[0].target).toMatchObject({
      label: 'Livre « Livre douteux »',
      hidden: false,
      ownerId: author.id,
    });
  });

  it('masquer un livre signalé le retire des lecteurs et du catalogue, pas de son auteur', async () => {
    const list = await api().get('/api/v1/admin/reports').set(bearer(mod));
    const report = list.body.items.find((r: { targetId: string }) => r.targetId === bookId);
    await api()
      .post(`/api/v1/admin/reports/${report.id}/resolve`)
      .set(bearer(mod))
      .send({ decision: 'hide', note: 'Contenu choquant' })
      .expect(204);

    await api().get(`/api/v1/read/books/${bookId}`).set(bearer(reader)).expect(404);
    const catalog = await api().get('/api/v1/catalog?q=douteux').expect(200);
    expect(catalog.body.items.map((b: { id: string }) => b.id)).not.toContain(bookId);
    const own = await api().get(`/api/v1/books/${bookId}`).set(bearer(author)).expect(200);
    expect(own.body.hiddenAt).toBeTruthy();

    const open = await api().get('/api/v1/admin/reports').set(bearer(mod));
    expect(open.body.items.some((r: { targetId: string }) => r.targetId === bookId)).toBe(false);
    const actions = await api().get('/api/v1/admin/actions').set(bearer(mod)).expect(200);
    expect(actions.body.items[0]).toMatchObject({
      action: 'hide_content',
      targetId: bookId,
      reason: 'Contenu choquant',
    });

    await api()
      .post(`/api/v1/admin/content/book/${bookId}/unhide`)
      .set(bearer(mod))
      .send({})
      .expect(204);
    await api().get(`/api/v1/read/books/${bookId}`).set(bearer(reader)).expect(200);
  });

  it('suspendre un compte coupe ses sessions ; un modérateur ne vise pas un rang égal ou supérieur', async () => {
    await api()
      .post(`/api/v1/admin/users/${admin.id}/suspend`)
      .set(bearer(mod))
      .send({})
      .expect(403);
    await api().post(`/api/v1/admin/users/${mod.id}/suspend`).set(bearer(mod)).send({}).expect(400);

    const login = await api()
      .post('/api/v1/auth/login')
      .send({ email: author.email, password: 'motdepasse' })
      .expect(200);
    const cookie = login.headers['set-cookie'] as unknown as string[];
    await api()
      .post(`/api/v1/admin/users/${author.id}/suspend`)
      .set(bearer(mod))
      .send({ reason: 'Spam' })
      .expect(204);

    const refused = await api()
      .post('/api/v1/auth/login')
      .send({ email: author.email, password: 'motdepasse' })
      .expect(403);
    expect(refused.body.error).toBe('ACCOUNT_SUSPENDED');
    await api().post('/api/v1/auth/refresh').set('Cookie', cookie).expect(401);
    const users = await api()
      .get(`/api/v1/admin/users?q=${author.username}`)
      .set(bearer(mod))
      .expect(200);
    expect(users.body.items[0]).toMatchObject({ userId: author.id, status: 'suspended' });

    await api()
      .post(`/api/v1/admin/users/${author.id}/reinstate`)
      .set(bearer(mod))
      .send({})
      .expect(204);
    await api()
      .post('/api/v1/auth/login')
      .send({ email: author.email, password: 'motdepasse' })
      .expect(200);
  });

  it('seul un administrateur change les rôles', async () => {
    await api()
      .patch(`/api/v1/admin/users/${reader.id}/role`)
      .set(bearer(mod))
      .send({ role: 'moderator' })
      .expect(403);
    await api()
      .patch(`/api/v1/admin/users/${admin.id}/role`)
      .set(bearer(admin))
      .send({ role: 'user' })
      .expect(400);
    await api()
      .patch(`/api/v1/admin/users/${reader.id}/role`)
      .set(bearer(admin))
      .send({ role: 'moderator' })
      .expect(204);
    const users = await api().get(`/api/v1/admin/users?q=${reader.username}`).set(bearer(admin));
    expect(users.body.items[0].role).toBe('moderator');
  });

  it('signaler un message exige d’être membre de la conversation', async () => {
    await api().post(`/api/v1/friends/${author.username}`).set(bearer(admin));
    await api().post(`/api/v1/friends/${admin.username}`).set(bearer(author));
    const conv = await api()
      .post('/api/v1/conversations/direct')
      .set(bearer(author))
      .send({ userId: admin.id })
      .expect(201);
    const msg = await api()
      .post(`/api/v1/conversations/${conv.body.id}/messages`)
      .set(bearer(author))
      .send({ body: 'Message abusif' });
    await api()
      .post('/api/v1/reports')
      .set(bearer(reader))
      .send({ targetType: 'message', targetId: msg.body.id, reason: 'harassment' })
      .expect(404);
    await api()
      .post('/api/v1/reports')
      .set(bearer(admin))
      .send({ targetType: 'message', targetId: msg.body.id, reason: 'harassment' })
      .expect(201);

    const list = await api().get('/api/v1/admin/reports').set(bearer(mod));
    const report = list.body.items.find((r: { targetId: string }) => r.targetId === msg.body.id);
    expect(report.target).toMatchObject({ label: 'Message privé', excerpt: 'Message abusif' });
    await api()
      .post(`/api/v1/admin/reports/${report.id}/resolve`)
      .set(bearer(mod))
      .send({ decision: 'hide' })
      .expect(204);
    const messages = await api()
      .get(`/api/v1/conversations/${conv.body.id}/messages`)
      .set(bearer(admin));
    expect(messages.body.items[0]).toMatchObject({ id: msg.body.id, body: '' });
  });

  it('seul un administrateur supprime un compte, définitivement et avec ses données', async () => {
    const victim = await signUpExtra('asupprimer');
    const book = await api()
      .post('/api/v1/books')
      .set(bearer(victim))
      .send({ title: 'À effacer' })
      .expect(201);

    await api().delete(`/api/v1/admin/users/${victim.id}`).set(bearer(mod)).send({}).expect(403);
    await api().delete(`/api/v1/admin/users/${admin.id}`).set(bearer(admin)).send({}).expect(400);
    await api()
      .delete(`/api/v1/admin/users/${victim.id}`)
      .set(bearer(admin))
      .send({ reason: 'Compte de test' })
      .expect(204);

    await api()
      .post('/api/v1/auth/login')
      .send({ email: victim.email, password: 'motdepasse' })
      .expect(401);
    await api().get(`/api/v1/books/${book.body.id}`).set(bearer(admin)).expect(404);
    const users = await api().get(`/api/v1/admin/users?q=${victim.username}`).set(bearer(admin));
    expect(users.body.items).toHaveLength(0);
    const actions = await api().get('/api/v1/admin/actions').set(bearer(admin));
    expect(actions.body.items[0]).toMatchObject({ action: 'delete_user', targetId: victim.id });
    expect(actions.body.items[0].reason).toContain(victim.email);
    // L'adresse est de nouveau libre.
    await api()
      .post('/api/v1/auth/register')
      .send({ email: victim.email, password: 'motdepasse', username: victim.username })
      .expect(201);
  });
});
