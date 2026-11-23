import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { hash, verify } from '@node-rs/argon2';
import { timingSafeEqual } from 'node:crypto';
import { DataSource, IsNull, MoreThan, Repository } from 'typeorm';
import { DEFAULT_READING_PREFERENCES, type AuthResponse } from '../shared';
import { APP_CONFIG, AppConfig } from '../config/configuration';
import { randomToken, sha256 } from '../common/crypto';
import { MailService } from '../mail/mail.service';
import { Profile } from './entities/profile.entity';
import { Session } from './entities/session.entity';
import { UserSettings } from './entities/user-settings.entity';
import { UserToken, UserTokenType } from './entities/user-token.entity';
import { User } from './entities/user.entity';
import type { LoginDto, RegisterDto } from './dto/auth.dto';
import { UsersService } from './users.service';

const ARGON_OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1 };
const VERIFICATION_TTL_MS = 24 * 3600_000;
const RESET_TTL_MS = 3600_000;
// Hachage factice pour garder un temps de réponse constant quand l'e-mail est inconnu.
const DUMMY_HASH_PROMISE = hash('laito-dummy-password', ARGON_OPTIONS);

export interface IssuedSession {
  auth: AuthResponse;
  refreshToken: string;
  refreshExpiresAt: Date;
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Session) private readonly sessions: Repository<Session>,
    @InjectRepository(UserToken) private readonly tokens: Repository<UserToken>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly usersService: UsersService,
    private readonly jwt: JwtService,
    private readonly mail: MailService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /** Inscription : le compte reste inutilisable tant que l'e-mail n'est pas vérifié. */
  async register(dto: RegisterDto): Promise<{ message: string }> {
    const message = 'Un e-mail de vérification vous a été envoyé.';
    const existing = await this.users.findOneBy({ email: dto.email });
    if (existing) {
      // Ne révèle pas l'existence du compte : on renvoie simplement un lien si besoin.
      if (!existing.emailVerifiedAt) await this.sendVerification(existing);
      return { message };
    }
    const usernameTaken = await this.dataSource
      .getRepository(Profile)
      .exists({ where: { username: dto.username } });
    if (usernameTaken) throw new ConflictException('Ce pseudo est déjà pris');

    const passwordHash = await hash(dto.password, ARGON_OPTIONS);
    const user = await this.dataSource.transaction(async (em) => {
      const u = await em.save(em.create(User, { email: dto.email, passwordHash }));
      await em.save(
        em.create(Profile, {
          userId: u.id,
          username: dto.username,
          displayName: dto.displayName?.trim() || dto.username,
          links: [],
        }),
      );
      await em.save(
        em.create(UserSettings, {
          userId: u.id,
          theme: dto.theme ?? 'parchment',
          readingPreferences: {
            ...DEFAULT_READING_PREFERENCES,
            theme: dto.theme ?? DEFAULT_READING_PREFERENCES.theme,
            fontSize: dto.fontSize ?? DEFAULT_READING_PREFERENCES.fontSize,
          },
        }),
      );
      return u;
    });
    await this.sendVerification(user);
    return { message };
  }

  async resendVerification(email: string): Promise<{ message: string }> {
    const user = await this.users.findOneBy({ email });
    if (user && !user.emailVerifiedAt) await this.sendVerification(user);
    return { message: 'Si un compte non vérifié existe, un nouvel e-mail a été envoyé.' };
  }

  async verifyEmail(token: string, userAgent?: string): Promise<IssuedSession> {
    const record = await this.consumeToken(token, 'email_verification');
    const user = await this.users.findOneByOrFail({ id: record.userId });
    if (!user.emailVerifiedAt) {
      user.emailVerifiedAt = new Date();
      await this.users.save(user);
    }
    return this.issueSession(user, userAgent);
  }

  async login(dto: LoginDto, userAgent?: string): Promise<IssuedSession> {
    const user = await this.users.findOneBy({ email: dto.email });
    const valid = user
      ? await verify(user.passwordHash, dto.password)
      : (await verify(await DUMMY_HASH_PROMISE, dto.password), false);
    if (!user || !valid) throw new UnauthorizedException('E-mail ou mot de passe incorrect');
    if (!user.emailVerifiedAt) {
      throw new ForbiddenException({
        statusCode: 403,
        error: 'EMAIL_NOT_VERIFIED',
        message: 'Vérifiez votre adresse e-mail avant de vous connecter.',
      });
    }
    if (user.status !== 'active') {
      throw new ForbiddenException({
        statusCode: 403,
        error: 'ACCOUNT_SUSPENDED',
        message: 'Ce compte est suspendu.',
      });
    }
    return this.issueSession(user, userAgent);
  }

  /** Rotation du refresh token. Un jeton déjà utilisé invalide la session (vol probable). */
  async refresh(rawCookie: string | undefined, userAgent?: string): Promise<IssuedSession> {
    const [sessionId, secret] = (rawCookie ?? '').split('.');
    if (!sessionId || !secret || !/^[0-9a-f-]{36}$/.test(sessionId)) {
      throw new UnauthorizedException('Session expirée');
    }
    const session = await this.sessions.findOneBy({ id: sessionId });
    if (!session || session.expiresAt < new Date()) {
      throw new UnauthorizedException('Session expirée');
    }
    const expected = Buffer.from(session.refreshTokenHash, 'hex');
    const actual = Buffer.from(sha256(secret), 'hex');
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
      await this.sessions.delete({ id: session.id });
      throw new UnauthorizedException('Session expirée');
    }
    const user = await this.users.findOneBy({ id: session.userId });
    if (!user || user.status !== 'active') {
      await this.sessions.delete({ id: session.id });
      throw new UnauthorizedException('Session expirée');
    }
    return this.issueSession(user, userAgent, session);
  }

  async logout(rawCookie: string | undefined): Promise<void> {
    const [sessionId] = (rawCookie ?? '').split('.');
    if (sessionId && /^[0-9a-f-]{36}$/.test(sessionId))
      await this.sessions.delete({ id: sessionId });
  }

  async forgotPassword(email: string): Promise<{ message: string }> {
    const user = await this.users.findOneBy({ email });
    if (user && user.status === 'active') {
      const token = await this.createToken(user.id, 'password_reset', RESET_TTL_MS);
      await this.mail.sendPasswordReset(user.email, token);
    }
    return { message: 'Si un compte existe pour cette adresse, un e-mail a été envoyé.' };
  }

  async resetPassword(token: string, password: string): Promise<{ message: string }> {
    const record = await this.consumeToken(token, 'password_reset');
    const passwordHash = await hash(password, ARGON_OPTIONS);
    await this.dataSource.transaction(async (em) => {
      // Réinitialiser le mot de passe prouve aussi la possession de l'adresse e-mail.
      await em.update(User, { id: record.userId }, { passwordHash });
      await em.update(
        User,
        { id: record.userId, emailVerifiedAt: IsNull() },
        { emailVerifiedAt: new Date() },
      );
      await em.delete(Session, { userId: record.userId });
    });
    return { message: 'Mot de passe modifié. Vous pouvez vous connecter.' };
  }

  async deleteAccount(userId: string, password: string): Promise<void> {
    const user = await this.users.findOne({ where: { id: userId }, relations: { profile: true } });
    if (!user) throw new UnauthorizedException();
    if (!(await verify(user.passwordHash, password))) {
      throw new BadRequestException('Mot de passe incorrect');
    }
    await this.usersService.purge(userId);
  }

  // ───────────────────────── interne ─────────────────────────

  private async issueSession(
    user: User,
    userAgent?: string,
    existing?: Session,
  ): Promise<IssuedSession> {
    const secret = randomToken(32);
    const refreshExpiresAt = new Date(Date.now() + this.config.refreshTtlDays * 86400_000);
    const session = existing ?? this.sessions.create({ userId: user.id });
    session.refreshTokenHash = sha256(secret);
    session.expiresAt = refreshExpiresAt;
    session.userAgent = userAgent?.slice(0, 500) ?? null;
    await this.sessions.save(session);
    // Nettoyage opportuniste des sessions expirées de l'utilisateur.
    await this.sessions
      .createQueryBuilder()
      .delete()
      .where('user_id = :id AND expires_at < now()', { id: user.id })
      .execute();

    const accessToken = await this.jwt.signAsync({ sub: user.id, role: user.role });
    return {
      auth: { accessToken, user: await this.usersService.getMe(user.id) },
      refreshToken: `${session.id}.${secret}`,
      refreshExpiresAt,
    };
  }

  private async sendVerification(user: User): Promise<void> {
    const token = await this.createToken(user.id, 'email_verification', VERIFICATION_TTL_MS);
    await this.mail.sendVerification(user.email, token);
  }

  private async createToken(userId: string, type: UserTokenType, ttlMs: number): Promise<string> {
    const token = randomToken(32);
    // Un seul jeton actif par type : les précédents sont invalidés.
    await this.tokens.update({ userId, type, usedAt: IsNull() }, { usedAt: new Date() });
    await this.tokens.save(
      this.tokens.create({
        userId,
        type,
        tokenHash: sha256(token),
        expiresAt: new Date(Date.now() + ttlMs),
        usedAt: null,
      }),
    );
    return token;
  }

  private async consumeToken(token: string, type: UserTokenType): Promise<UserToken> {
    const record = await this.tokens.findOneBy({
      tokenHash: sha256(token),
      type,
      usedAt: IsNull(),
      expiresAt: MoreThan(new Date()),
    });
    if (!record) throw new BadRequestException('Ce lien est invalide ou a expiré.');
    record.usedAt = new Date();
    await this.tokens.save(record);
    return record;
  }
}
