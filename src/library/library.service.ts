import { Injectable, NotFoundException } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { BookDto, ReadableBookDto, ReadableChapterDto, ReadingProgressDto } from '../shared';
import { Events, type UserDeletedEvent, type UserExportEvent } from '../common/events';
import { UsersService } from '../identity/users.service';
import { AuthorizationService } from '../sharing/authorization.service';
import { toChapterDto } from '../writing/mappers';
import { WritingService } from '../writing/writing.service';
import { Bookmark } from './entities/bookmark.entity';
import { ReadingProgress } from './entities/reading-progress.entity';
import type { SaveProgressDto } from './dto/reading.dto';

@Injectable()
export class LibraryService {
  constructor(
    @InjectRepository(ReadingProgress) private readonly progress: Repository<ReadingProgress>,
    @InjectRepository(Bookmark) private readonly bookmarks: Repository<Bookmark>,
    private readonly authz: AuthorizationService,
    private readonly writing: WritingService,
    private readonly users: UsersService,
  ) {}

  async readBook(viewerId: string | null, bookId: string, share?: string): Promise<ReadableBookDto> {
    const r = await this.authz.readableBook(viewerId, bookId, share);
    const dto = await this.writing.bookToDto(r.book, { onlyVisibleChapters: !r.isOwner });
    const authors = await this.users.getPublicProfiles([r.book.authorId]);
    const progress = viewerId ? await this.progress.findOneBy({ userId: viewerId, bookId }) : null;
    return {
      book: { ...dto, chapterCount: r.chapters.length, author: authors.get(r.book.authorId) },
      chapters: r.chapters.map(toChapterDto),
      progress:
        progress && r.chapters.some((c) => c.id === progress.chapterId) ? toProgressDto(progress) : null,
      isOwner: r.isOwner,
    };
  }

  async readChapter(viewerId: string | null, chapterId: string, share?: string): Promise<ReadableChapterDto> {
    const r = await this.authz.readableChapter(viewerId, chapterId, share);
    const index = r.chapters.findIndex((c) => c.id === chapterId);
    return {
      chapter: toChapterDto(r.chapter),
      content: await this.writing.getChapterText(chapterId),
      previousChapterId: r.chapters[index - 1]?.id ?? null,
      nextChapterId: r.chapters[index + 1]?.id ?? null,
    };
  }

  async saveProgress(userId: string, dto: SaveProgressDto): Promise<ReadingProgressDto> {
    const r = await this.authz.readableChapter(userId, dto.chapterId, dto.shareToken);
    if (r.book.id !== dto.bookId) throw new NotFoundException();
    await this.progress.upsert(
      { userId, bookId: dto.bookId, chapterId: dto.chapterId, position: dto.position },
      ['userId', 'bookId'],
    );
    return toProgressDto(await this.progress.findOneByOrFail({ userId, bookId: dto.bookId }));
  }

  /** Lectures en cours, les plus récentes d'abord (livres toujours accessibles uniquement). */
  async listProgress(userId: string): Promise<(ReadingProgressDto & { book: BookDto })[]> {
    const rows = await this.progress.find({ where: { userId }, order: { updatedAt: 'DESC' }, take: 30 });
    const out: (ReadingProgressDto & { book: BookDto })[] = [];
    for (const p of rows) {
      try {
        const { book } = await this.readBook(userId, p.bookId);
        out.push({ ...toProgressDto(p), book });
      } catch (err) {
        if (!(err instanceof NotFoundException)) throw err;
      }
    }
    return out;
  }

  /** Livres les plus lus récemment (lecteurs distincts) — alimente les tendances du catalogue. */
  async trendingBookIds(days = 14, limit = 100): Promise<string[]> {
    const rows = await this.progress
      .createQueryBuilder('p')
      .select('p.book_id', 'bookId')
      .addSelect('COUNT(DISTINCT p.user_id)', 'readers')
      .where(`p.updated_at > now() - make_interval(days => :days)`, { days })
      .groupBy('p.book_id')
      .orderBy('readers', 'DESC')
      .limit(limit)
      .getRawMany<{ bookId: string }>();
    return rows.map((r) => r.bookId);
  }

  @OnEvent(Events.UserDeleted, { async: true, promisify: true })
  async onUserDeleted({ userId }: UserDeletedEvent): Promise<void> {
    await this.progress.delete({ userId });
    await this.bookmarks.delete({ userId });
  }

  @OnEvent(Events.BookDeleted, { async: true, promisify: true })
  async onBookDeleted({ bookId }: { bookId: string }): Promise<void> {
    await this.progress.delete({ bookId });
    await this.bookmarks.delete({ bookId });
  }

  @OnEvent(Events.UserExport, { async: true, promisify: true })
  async onUserExport({ userId }: UserExportEvent) {
    const [progress, bookmarks] = await Promise.all([
      this.progress.find({ where: { userId } }),
      this.bookmarks.find({ where: { userId } }),
    ]);
    return { library: { readingProgress: progress.map(toProgressDto), bookmarks: bookmarks.map((b) => b.bookId) } };
  }
}

function toProgressDto(p: ReadingProgress): ReadingProgressDto {
  return { bookId: p.bookId, chapterId: p.chapterId, position: p.position, updatedAt: p.updatedAt.toISOString() };
}
