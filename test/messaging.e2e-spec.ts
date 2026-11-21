/**
 * Messagerie : conversations privées entre amis, groupes, temps réel.
 * Nécessite PostgreSQL (migrations appliquées) et Redis.
 */
import { INestApplication } from '@nestjs/common';
import type { AddressInfo } from 'node:net';
import { io, type Socket } from 'socket.io-client';
import request from 'supertest';
import { bearer, createTestApp, type TestUser } from './support';

describe('Messagerie (e2e)', () => {
  let app: INestApplication;
  let alice: TestUser;
  let bob: TestUser;
  let chloe: TestUser;
  let stranger: TestUser;
  let url: string;
  const sockets: Socket[] = [];
  const api = () => request(app.getHttpServer());

  const befriend = async (a: TestUser, b: TestUser) => {
    await api().post(`/api/v1/friends/${b.username}`).set(bearer(a)).expect(201);
    await api().post(`/api/v1/friends/${a.username}`).set(bearer(b)).expect(201);
  };

  const connect = (u: TestUser) =>
    new Promise<Socket>((resolve, reject) => {
      const s = io(`${url}/messaging`, { auth: { token: u.token }, transports: ['websocket'] });
      sockets.push(s);
      s.on('connect', () => resolve(s));
      s.on('connect_error', reject);
    });

  const next = <T>(s: Socket, event: string) =>
    new Promise<T>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`pas d'événement ${event}`)), 5000);
      s.once(event, (payload: T) => {
        clearTimeout(t);
        resolve(payload);
      });
    });

  beforeAll(async () => {
    const ctx = await createTestApp();
    app = ctx.app;
    await app.listen(0);
    url = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
    [alice, bob, chloe, stranger] = await Promise.all(
      ['alice', 'bob', 'chloe', 'inconnu'].map((n) => ctx.signUp(n)),
    );
    await befriend(alice, bob);
    await befriend(alice, chloe);
  });

  afterAll(async () => {
    sockets.forEach((s) => s.close());
    await app?.close();
  });

  it('cherche des personnes par pseudo pour les ajouter', async () => {
    const res = await api()
      .get(`/api/v1/users/search?q=${stranger.username}`)
      .set(bearer(alice))
      .expect(200);
    expect(res.body.map((p: { userId: string }) => p.userId)).toContain(stranger.id);
    const self = await api()
      .get(`/api/v1/users/search?q=${alice.username}`)
      .set(bearer(alice))
      .expect(200);
    expect(self.body.map((p: { userId: string }) => p.userId)).not.toContain(alice.id);
  });

  it("n'autorise une conversation privée qu'entre amis", async () => {
    await api()
      .post('/api/v1/conversations/direct')
      .set(bearer(alice))
      .send({ userId: stranger.id })
      .expect(403);
    await api()
      .post('/api/v1/conversations/direct')
      .set(bearer(alice))
      .send({ userId: alice.id })
      .expect(400);
  });

  it('ouvre une seule conversation privée par paire et livre les messages en temps réel', async () => {
    const first = await api()
      .post('/api/v1/conversations/direct')
      .set(bearer(alice))
      .send({ userId: bob.id })
      .expect(201);
    const again = await api()
      .post('/api/v1/conversations/direct')
      .set(bearer(bob))
      .send({ userId: alice.id })
      .expect(201);
    expect(again.body.id).toBe(first.body.id);
    expect(first.body).toMatchObject({ type: 'direct', canSend: true, unreadCount: 0 });

    const bobSocket = await connect(bob);
    const received = next<{ conversationId: string; message: { body: string; clientId: string } }>(
      bobSocket,
      'message:new',
    );
    const sent = await api()
      .post(`/api/v1/conversations/${first.body.id}/messages`)
      .set(bearer(alice))
      .send({ body: '  Bonjour Bob !  ', clientId: 'c-1' })
      .expect(201);
    expect(sent.body).toMatchObject({ body: 'Bonjour Bob !', clientId: 'c-1', senderId: alice.id });
    expect((await received).message.body).toBe('Bonjour Bob !');

    const bobList = await api().get('/api/v1/conversations').set(bearer(bob)).expect(200);
    expect(bobList.body.items[0]).toMatchObject({ id: first.body.id, unreadCount: 1 });
    expect(
      (await api().get('/api/v1/conversations/unread-count').set(bearer(bob))).body.count,
    ).toBe(1);

    await api().post(`/api/v1/conversations/${first.body.id}/read`).set(bearer(bob)).expect(204);
    expect(
      (await api().get('/api/v1/conversations/unread-count').set(bearer(bob))).body.count,
    ).toBe(0);
  });

  it("refuse l'accès à une conversation dont on n'est pas membre (404)", async () => {
    const conv = await api()
      .post('/api/v1/conversations/direct')
      .set(bearer(alice))
      .send({ userId: bob.id });
    await api().get(`/api/v1/conversations/${conv.body.id}`).set(bearer(stranger)).expect(404);
    await api()
      .get(`/api/v1/conversations/${conv.body.id}/messages`)
      .set(bearer(stranger))
      .expect(404);
    await api()
      .post(`/api/v1/conversations/${conv.body.id}/messages`)
      .set(bearer(stranger))
      .send({ body: 'x' })
      .expect(404);
  });

  it('pagine les messages par curseur, du plus récent au plus ancien', async () => {
    const conv = await api()
      .post('/api/v1/conversations/direct')
      .set(bearer(alice))
      .send({ userId: chloe.id });
    for (let i = 1; i <= 5; i++) {
      await api()
        .post(`/api/v1/conversations/${conv.body.id}/messages`)
        .set(bearer(alice))
        .send({ body: `m${i}` });
    }
    const p1 = await api()
      .get(`/api/v1/conversations/${conv.body.id}/messages?limit=3`)
      .set(bearer(chloe))
      .expect(200);
    expect(p1.body.items.map((m: { body: string }) => m.body)).toEqual(['m5', 'm4', 'm3']);
    const p2 = await api()
      .get(`/api/v1/conversations/${conv.body.id}/messages?limit=3&before=${p1.body.nextCursor}`)
      .set(bearer(chloe))
      .expect(200);
    expect(p2.body.items.map((m: { body: string }) => m.body)).toEqual(['m2', 'm1']);
    expect(p2.body.nextCursor).toBeNull();
  });

  it('supprime ses propres messages seulement', async () => {
    const conv = await api()
      .post('/api/v1/conversations/direct')
      .set(bearer(alice))
      .send({ userId: bob.id });
    const msg = await api()
      .post(`/api/v1/conversations/${conv.body.id}/messages`)
      .set(bearer(alice))
      .send({ body: 'oups' });
    await api()
      .delete(`/api/v1/conversations/${conv.body.id}/messages/${msg.body.id}`)
      .set(bearer(bob))
      .expect(404);
    await api()
      .delete(`/api/v1/conversations/${conv.body.id}/messages/${msg.body.id}`)
      .set(bearer(alice))
      .expect(204);
    const list = await api().get(`/api/v1/conversations/${conv.body.id}/messages`).set(bearer(bob));
    expect(list.body.items[0]).toMatchObject({ id: msg.body.id, body: '' });
    expect(list.body.items[0].deletedAt).toBeTruthy();
  });

  it('crée un groupe avec des amis uniquement, puis le gère', async () => {
    await api()
      .post('/api/v1/conversations/group')
      .set(bearer(alice))
      .send({ title: 'Atelier', memberIds: [bob.id, stranger.id] })
      .expect(400);

    const chloeSocket = await connect(chloe);
    const group = await api()
      .post('/api/v1/conversations/group')
      .set(bearer(alice))
      .send({ title: 'Atelier', memberIds: [bob.id] })
      .expect(201);
    expect(group.body).toMatchObject({ type: 'group', title: 'Atelier', myRole: 'owner' });
    expect(group.body.members).toHaveLength(2);

    // Bob (simple membre) ne peut ni renommer ni ajouter.
    await api()
      .patch(`/api/v1/conversations/${group.body.id}`)
      .set(bearer(bob))
      .send({ title: 'X' })
      .expect(403);

    const updated = next<{ conversationId: string }>(chloeSocket, 'conversation:updated');
    await api()
      .post(`/api/v1/conversations/${group.body.id}/members`)
      .set(bearer(alice))
      .send({ userIds: [chloe.id] })
      .expect(201);
    expect((await updated).conversationId).toBe(group.body.id);

    await api()
      .patch(`/api/v1/conversations/${group.body.id}`)
      .set(bearer(alice))
      .send({ title: 'Atelier du jeudi' })
      .expect(200);
    await api()
      .post(`/api/v1/conversations/${group.body.id}/messages`)
      .set(bearer(chloe))
      .send({ body: 'Coucou' })
      .expect(201);

    // Bob ne peut pas retirer le propriétaire ; Alice retire Bob, qui est prévenu.
    await api()
      .delete(`/api/v1/conversations/${group.body.id}/members/${alice.id}`)
      .set(bearer(bob))
      .expect(403);
    const bobSocket = await connect(bob);
    const removed = next<{ conversationId: string }>(bobSocket, 'conversation:removed');
    await api()
      .delete(`/api/v1/conversations/${group.body.id}/members/${bob.id}`)
      .set(bearer(alice))
      .expect(204);
    expect((await removed).conversationId).toBe(group.body.id);
    await api().get(`/api/v1/conversations/${group.body.id}`).set(bearer(bob)).expect(404);

    // La propriétaire part : Chloé reprend le groupe.
    await api()
      .delete(`/api/v1/conversations/${group.body.id}/members/${alice.id}`)
      .set(bearer(alice))
      .expect(204);
    const chloeView = await api()
      .get(`/api/v1/conversations/${group.body.id}`)
      .set(bearer(chloe))
      .expect(200);
    expect(chloeView.body).toMatchObject({ myRole: 'owner', title: 'Atelier du jeudi' });
    expect(chloeView.body.members).toHaveLength(1);
  });

  it("passe en lecture seule quand l'amitié est retirée", async () => {
    const conv = await api()
      .post('/api/v1/conversations/direct')
      .set(bearer(alice))
      .send({ userId: chloe.id });
    await api().delete(`/api/v1/friends/${chloe.id}`).set(bearer(alice)).expect(204);
    const view = await api()
      .get(`/api/v1/conversations/${conv.body.id}`)
      .set(bearer(alice))
      .expect(200);
    expect(view.body.canSend).toBe(false);
    await api()
      .post(`/api/v1/conversations/${conv.body.id}/messages`)
      .set(bearer(alice))
      .send({ body: 'encore là ?' })
      .expect(403);
    // L'historique reste lisible.
    await api()
      .get(`/api/v1/conversations/${conv.body.id}/messages`)
      .set(bearer(chloe))
      .expect(200);
  });

  it('refuse une connexion temps réel sans jeton valide', async () => {
    const s = io(`${url}/messaging`, { auth: { token: 'faux' }, transports: ['websocket'] });
    sockets.push(s);
    await next(s, 'disconnect');
  });
});
