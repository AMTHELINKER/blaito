import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { MailService } from '../src/mail/mail.service';
import { setupApp } from '../src/setup-app';

/** Remplace l'envoi d'e-mails : les jetons sont lus directement par les tests. */
export class FakeMail {
  sent: { kind: 'verify' | 'reset'; to: string; token: string }[] = [];
  async sendVerification(to: string, token: string) {
    this.sent.push({ kind: 'verify', to, token });
  }
  async sendPasswordReset(to: string, token: string) {
    this.sent.push({ kind: 'reset', to, token });
  }
  last(to: string, kind: 'verify' | 'reset') {
    return [...this.sent].reverse().find((m) => m.to === to && m.kind === kind)?.token;
  }
}

export interface TestUser {
  email: string;
  username: string;
  id: string;
  token: string;
}

export async function createTestApp() {
  const mail = new FakeMail();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(MailService)
    .useValue(mail)
    .compile();
  const app: INestApplication = moduleRef.createNestApplication();
  await setupApp(app);
  await app.init();
  const run = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  /** Inscrit, vérifie et connecte un utilisateur. */
  async function signUp(name: string): Promise<TestUser> {
    const email = `${name}-${run}@test.laito`;
    const username = `${name}_${run}`.slice(0, 30);
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password: 'motdepasse', username })
      .expect(201);
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/verify-email')
      .send({ token: mail.last(email, 'verify') })
      .expect(200);
    return { email, username, id: res.body.user.id, token: res.body.accessToken };
  }

  return { app, mail, run, signUp };
}

export const bearer = (u: { token: string }) => ({ Authorization: `Bearer ${u.token}` });
