import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { SocialService } from '../social/social.service';
import { WritingService } from '../writing/writing.service';
import type { Book } from '../writing/entities/book.entity';
import type { Chapter } from '../writing/entities/chapter.entity';
import { AccessContext, canReadBook, canReadChapter, isOwner, ResourceRef } from './access-policy';
import { AccessGrant } from './entities/access-grant.entity';
import { ShareLink } from './entities/share-link.entity';

export interface ReadableBook {
  book: Book;
  chapters: Chapter[];
  isOwner: boolean;
  ctx: AccessContext;
}

/**
 * Point d'entrée unique de « qui peut lire quoi ». Rassemble le contexte du lecteur
 * (amitié, lien, invitations) puis délègue la décision à la politique pure (access-policy).
 * Toute ressource non autorisée est signalée par une 404 : son existence n'est pas révélée.
 */
@Injectable()
export class AuthorizationService {
  constructor(
    @InjectRepository(ShareLink) private readonly links: Repository<ShareLink>,
    @InjectRepository(AccessGrant) private readonly grants: Repository<AccessGrant>,
    private readonly writing: WritingService,
    private readonly social: SocialService,
  ) {}

  async findValidLink(token: string | undefined | null): Promise<ShareLink | null> {
    if (!token || token.length > 64) return null;
    const link = await this.links.findOneBy({ token });
    if (!link || link.revokedAt) return null;
    if (link.expiresAt && link.expiresAt <= new Date()) return null;
    return link;
  }

  async readableBook(viewerId: string | null, bookId: string, shareToken?: string | null): Promise<ReadableBook> {
    const meta = await this.writing.findBookMeta(bookId);
    if (!meta) throw new NotFoundException();
    const chapters = await this.writing.listChapterEntities(bookId);
    const ctx = await this.buildContext(viewerId, meta.book, chapters, shareToken);
    const chapterIds = chapters.map((c) => c.id);
    if (!canReadBook(meta.book, chapterIds, ctx)) throw new NotFoundException();
    return {
      book: meta.book,
      chapters: chapters.filter((c) => canReadChapter(meta.book, c, chapterIds, ctx)),
      isOwner: isOwner(meta.book, ctx),
      ctx,
    };
  }

  async readableChapter(viewerId: string | null, chapterId: string, shareToken?: string | null) {
    const meta = await this.writing.findChapterMeta(chapterId);
    if (!meta) throw new NotFoundException();
    const readable = await this.readableBook(viewerId, meta.bookId, shareToken);
    const chapter = readable.chapters.find((c) => c.id === chapterId);
    if (!chapter) throw new NotFoundException();
    return { ...readable, chapter };
  }

  async canRead(viewerId: string | null, ref: ResourceRef, shareToken?: string | null): Promise<boolean> {
    try {
      if (ref.resourceType === 'book') await this.readableBook(viewerId, ref.resourceId, shareToken);
      else await this.readableChapter(viewerId, ref.resourceId, shareToken);
      return true;
    } catch (err) {
      if (err instanceof NotFoundException) return false;
      throw err;
    }
  }

  private async buildContext(
    viewerId: string | null,
    book: Book,
    chapters: Chapter[],
    shareToken?: string | null,
  ): Promise<AccessContext> {
    const link = await this.findValidLink(shareToken);
    const chapterIds = chapters.map((c) => c.id);
    let grants: ResourceRef[] = [];
    let isFriendOfAuthor = false;
    if (viewerId && viewerId !== book.authorId) {
      grants = await this.grants
        .createQueryBuilder('g')
        .select(['g.resourceType', 'g.resourceId'])
        .where('g.grantee_user_id = :viewerId', { viewerId })
        .andWhere(
          new Brackets((w) => {
            w.where("g.resource_type = 'book' AND g.resource_id = :bookId", { bookId: book.id });
            if (chapterIds.length) {
              w.orWhere("g.resource_type = 'chapter' AND g.resource_id IN (:...chapterIds)", { chapterIds });
            }
          }),
        )
        .getMany();
      isFriendOfAuthor = await this.social.areFriends(viewerId, book.authorId);
    }
    return {
      viewerId,
      isFriendOfAuthor,
      shareLink: link ? { resourceType: link.resourceType, resourceId: link.resourceId } : null,
      grants: grants.map((g) => ({ resourceType: g.resourceType, resourceId: g.resourceId })),
    };
  }
}
