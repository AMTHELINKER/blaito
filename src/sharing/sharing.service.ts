import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import type { AccessGrantDto, BookDto, ResourceType, ShareLinkDto } from '../shared';
import { APP_CONFIG, AppConfig } from '../config/configuration';
import { randomToken } from '../common/crypto';
import {
  Events,
  type BookDeletedEvent,
  type UserDeletedEvent,
  type UserExportEvent,
} from '../common/events';
import { UsersService } from '../identity/users.service';
import { WritingService } from '../writing/writing.service';
import { AuthorizationService } from './authorization.service';
import type { CreateGrantDto, CreateShareLinkDto } from './dto/sharing.dto';
import { AccessGrant } from './entities/access-grant.entity';
import { ShareLink } from './entities/share-link.entity';

@Injectable()
export class SharingService {
  constructor(
    @InjectRepository(ShareLink) private readonly links: Repository<ShareLink>,
    @InjectRepository(AccessGrant) private readonly grants: Repository<AccessGrant>,
    private readonly writing: WritingService,
    private readonly users: UsersService,
    private readonly authz: AuthorizationService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  // ───────────────────────── Liens ─────────────────────────

  async listLinks(
    ownerId: string,
    resourceType: ResourceType,
    resourceId: string,
  ): Promise<ShareLinkDto[]> {
    await this.assertOwner(ownerId, resourceType, resourceId);
    const rows = await this.links.find({
      where: { resourceType, resourceId },
      order: { createdAt: 'DESC' },
    });
    return rows.map((l) => this.toLinkDto(l));
  }

  async createLink(ownerId: string, dto: CreateShareLinkDto): Promise<ShareLinkDto> {
    await this.assertOwner(ownerId, dto.resourceType, dto.resourceId);
    const expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
    if (expiresAt && expiresAt <= new Date())
      throw new BadRequestException("La date d'expiration est passée");
    // Un lien n'a d'effet que si la ressource est au moins en « lien privé » : on ouvre un livre privé.
    if (dto.resourceType === 'book') {
      const meta = await this.writing.findBookMeta(dto.resourceId);
      if (meta?.visibility === 'private') {
        await this.writing.update(ownerId, dto.resourceId, { visibility: 'link' });
      }
    } else {
      const meta = await this.writing.findChapterMeta(dto.resourceId);
      if (meta?.visibility === 'private') {
        await this.writing.updateChapter(ownerId, dto.resourceId, { visibility: 'link' });
      }
      const book = meta && (await this.writing.findBookMeta(meta.bookId));
      if (book?.visibility === 'private') {
        await this.writing.update(ownerId, book.id, { visibility: 'link' });
      }
    }
    const link = await this.links.save(
      this.links.create({
        resourceType: dto.resourceType,
        resourceId: dto.resourceId,
        token: randomToken(24),
        expiresAt,
        revokedAt: null,
      }),
    );
    return this.toLinkDto(link);
  }

  /** Révocation immédiate : le lien ne donne plus accès. */
  async revokeLink(ownerId: string, linkId: string): Promise<void> {
    const link = await this.links.findOneBy({ id: linkId });
    if (!link) throw new NotFoundException();
    await this.assertOwner(ownerId, link.resourceType, link.resourceId);
    if (!link.revokedAt) {
      link.revokedAt = new Date();
      await this.links.save(link);
    }
  }

  async resolve(token: string) {
    const link = await this.authz.findValidLink(token);
    if (!link) throw new NotFoundException();
    const ok = await this.authz.canRead(null, link, token);
    if (!ok) throw new NotFoundException();
    const bookId =
      link.resourceType === 'book'
        ? link.resourceId
        : (await this.writing.findChapterMeta(link.resourceId))!.bookId;
    return { resourceType: link.resourceType, resourceId: link.resourceId, bookId };
  }

  // ───────────────────────── Invitations ─────────────────────────

  async listGrants(
    ownerId: string,
    resourceType: ResourceType,
    resourceId: string,
  ): Promise<AccessGrantDto[]> {
    await this.assertOwner(ownerId, resourceType, resourceId);
    const rows = await this.grants.find({
      where: { resourceType, resourceId },
      order: { createdAt: 'DESC' },
    });
    const profiles = await this.users.getPublicProfiles(rows.map((g) => g.granteeUserId));
    return rows.flatMap((g) => {
      const grantee = profiles.get(g.granteeUserId);
      return grantee ? [this.toGrantDto(g, grantee)] : [];
    });
  }

  async createGrant(ownerId: string, dto: CreateGrantDto): Promise<AccessGrantDto> {
    await this.assertOwner(ownerId, dto.resourceType, dto.resourceId);
    const profile = await this.users.findProfileByUsername(dto.username);
    if (!profile) throw new NotFoundException('Utilisateur introuvable');
    if (profile.userId === ownerId) throw new BadRequestException('Vous êtes déjà l’auteur');
    let grant = await this.grants.findOneBy({
      resourceType: dto.resourceType,
      resourceId: dto.resourceId,
      granteeUserId: profile.userId,
    });
    grant ??= this.grants.create({
      resourceType: dto.resourceType,
      resourceId: dto.resourceId,
      granteeUserId: profile.userId,
    });
    grant.permission = dto.permission ?? 'read';
    grant = await this.grants.save(grant);
    return this.toGrantDto(grant, profile);
  }

  async removeGrant(ownerId: string, grantId: string): Promise<void> {
    const grant = await this.grants.findOneBy({ id: grantId });
    if (!grant) throw new NotFoundException();
    await this.assertOwner(ownerId, grant.resourceType, grant.resourceId);
    await this.grants.delete({ id: grant.id });
  }

  /** Livres auxquels l'utilisateur a été invité (et qu'il peut effectivement lire). */
  async sharedWithMe(userId: string): Promise<BookDto[]> {
    const rows = await this.grants.find({
      where: { granteeUserId: userId },
      order: { createdAt: 'DESC' },
    });
    const bookIds = new Set<string>();
    for (const g of rows) {
      if (g.resourceType === 'book') bookIds.add(g.resourceId);
      else {
        const ch = await this.writing.findChapterMeta(g.resourceId);
        if (ch) bookIds.add(ch.bookId);
      }
    }
    const readable = [];
    for (const id of bookIds) {
      if (await this.authz.canRead(userId, { resourceType: 'book', resourceId: id }))
        readable.push(id);
    }
    const books = await this.writing.findBooksByIds(readable);
    const dtos = await this.writing.booksToDtos(books, { onlyVisibleChapters: true });
    const authors = await this.users.getPublicProfiles(books.map((b) => b.authorId));
    return dtos.map((d) => ({ ...d, author: authors.get(d.authorId) }));
  }

  // ───────────────────────── Événements ─────────────────────────

  @OnEvent(Events.BookDeleted, { async: true, promisify: true })
  async onBookDeleted({ bookId, chapterIds }: BookDeletedEvent): Promise<void> {
    await this.links.delete({ resourceType: 'book', resourceId: bookId });
    await this.grants.delete({ resourceType: 'book', resourceId: bookId });
    if (chapterIds.length) {
      await this.links.delete({ resourceType: 'chapter', resourceId: In(chapterIds) });
      await this.grants.delete({ resourceType: 'chapter', resourceId: In(chapterIds) });
    }
  }

  @OnEvent(Events.UserDeleted, { async: true, promisify: true })
  async onUserDeleted({ userId }: UserDeletedEvent): Promise<void> {
    await this.grants.delete({ granteeUserId: userId });
  }

  @OnEvent(Events.UserExport, { async: true, promisify: true })
  async onUserExport({ userId }: UserExportEvent) {
    const received = await this.grants.find({ where: { granteeUserId: userId } });
    return {
      sharing: {
        invitationsReceived: received.map((g) => ({
          resourceType: g.resourceType,
          resourceId: g.resourceId,
          permission: g.permission,
          createdAt: g.createdAt,
        })),
      },
    };
  }

  // ───────────────────────── interne ─────────────────────────

  private async assertOwner(userId: string, type: ResourceType, id: string): Promise<void> {
    if (type === 'book') {
      const meta = await this.writing.findBookMeta(id);
      if (meta?.authorId === userId) return;
    } else {
      const ch = await this.writing.findChapterMeta(id);
      const book = ch && (await this.writing.findBookMeta(ch.bookId));
      if (book?.authorId === userId) return;
    }
    throw new NotFoundException();
  }

  private toLinkDto(l: ShareLink): ShareLinkDto {
    return {
      id: l.id,
      resourceType: l.resourceType,
      resourceId: l.resourceId,
      token: l.token,
      url: `${this.config.webOrigin}/s/${l.token}`,
      expiresAt: l.expiresAt?.toISOString() ?? null,
      revokedAt: l.revokedAt?.toISOString() ?? null,
      createdAt: l.createdAt.toISOString(),
    };
  }

  private toGrantDto(g: AccessGrant, grantee: AccessGrantDto['grantee']): AccessGrantDto {
    return {
      id: g.id,
      resourceType: g.resourceType,
      resourceId: g.resourceId,
      grantee: {
        userId: grantee.userId,
        username: grantee.username,
        displayName: grantee.displayName,
        avatarUrl: grantee.avatarUrl,
      },
      permission: g.permission,
      createdAt: g.createdAt.toISOString(),
    };
  }
}
