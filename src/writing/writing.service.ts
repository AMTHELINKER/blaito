import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { Brackets, DataSource, EntityManager, In, IsNull, Not, Repository } from 'typeorm';
import {
  countWords,
  slugify,
  toPlainText,
  type BookDto,
  type ChapterContentDto,
  type ChapterDto,
  type Visibility,
  type WritingStatus,
} from '../shared';
import {
  Events,
  type BookDeletedEvent,
  type UserDeletedEvent,
  type UserExportEvent,
} from '../common/events';
import { StorageService } from '../storage/storage.service';
import type {
  CreateBookDto,
  CreateChapterDto,
  SaveContentDto,
  UpdateBookDto,
  UpdateChapterDto,
} from './dto/writing.dto';
import { BookTag } from './entities/book-tag.entity';
import { Book } from './entities/book.entity';
import { ChapterContent } from './entities/chapter-content.entity';
import { ChapterVersion } from './entities/chapter-version.entity';
import { Chapter } from './entities/chapter.entity';
import { Tag } from './entities/tag.entity';
import { toBookDto, toChapterDto } from './mappers';

/** Intervalle minimal entre deux instantanés automatiques d'un chapitre. */
const SNAPSHOT_INTERVAL_MS = 10 * 60_000;

/** Métadonnées minimales nécessaires au service d'autorisation. */
export interface BookMeta {
  id: string;
  authorId: string;
  visibility: Visibility;
  status: WritingStatus;
}
export interface ChapterMeta {
  id: string;
  bookId: string;
  visibility: Visibility;
  status: WritingStatus;
}

export interface CatalogQuery {
  q?: string;
  genre?: string;
  authorIds?: string[];
  after?: { publishedAt: string; id: string } | null;
  limit: number;
}

@Injectable()
export class WritingService {
  constructor(
    @InjectRepository(Book) private readonly books: Repository<Book>,
    @InjectRepository(Chapter) private readonly chapters: Repository<Chapter>,
    @InjectRepository(ChapterContent) private readonly contents: Repository<ChapterContent>,
    @InjectRepository(ChapterVersion) private readonly versions: Repository<ChapterVersion>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly storage: StorageService,
    private readonly events: EventEmitter2,
  ) {}

  // ───────────────────────── Livres (auteur) ─────────────────────────

  async listMine(authorId: string): Promise<BookDto[]> {
    const books = await this.books.find({ where: { authorId }, order: { updatedAt: 'DESC' } });
    return this.decorate(books, { onlyVisibleChapters: false });
  }

  async create(authorId: string, dto: CreateBookDto): Promise<BookDto> {
    const book = await this.dataSource.transaction(async (em) => {
      const b = await em.save(
        em.create(Book, {
          authorId,
          title: dto.title,
          slug: slugify(dto.title),
          summary: dto.summary?.trim() || null,
          genre: dto.genre || null,
          // Exigence : un livre est privé par défaut.
          visibility: 'private',
          status: 'draft',
        }),
      );
      if (dto.tags) await this.setTags(em, b.id, dto.tags);
      return b;
    });
    return this.toDto(book, false);
  }

  async getOwned(authorId: string, bookId: string): Promise<BookDto> {
    return this.toDto(await this.findOwnedBook(authorId, bookId), false);
  }

  async update(authorId: string, bookId: string, dto: UpdateBookDto): Promise<BookDto> {
    const book = await this.findOwnedBook(authorId, bookId);
    await this.dataSource.transaction(async (em) => {
      if (dto.title !== undefined) {
        book.title = dto.title;
        book.slug = slugify(dto.title);
      }
      if (dto.summary !== undefined) book.summary = dto.summary.trim() || null;
      if (dto.genre !== undefined) book.genre = dto.genre || null;
      if (dto.visibility !== undefined) book.visibility = dto.visibility;
      if (dto.status !== undefined) {
        book.status = dto.status;
        if (dto.status === 'published' && !book.publishedAt) book.publishedAt = new Date();
      }
      // Un livre public apparaît dans le catalogue à sa date de première ouverture.
      if (book.visibility === 'public' && book.status !== 'draft' && !book.publishedAt) {
        book.publishedAt = new Date();
      }
      await em.save(book);
      if (dto.tags !== undefined) await this.setTags(em, book.id, dto.tags);
    });
    return this.toDto(book, false);
  }

  /** Suppression douce : le livre peut être restauré (annulation pendant quelques secondes). */
  async remove(authorId: string, bookId: string): Promise<void> {
    const book = await this.findOwnedBook(authorId, bookId);
    await this.books.softDelete({ id: book.id });
  }

  async restore(authorId: string, bookId: string): Promise<BookDto> {
    const book = await this.books.findOne({ where: { id: bookId, authorId }, withDeleted: true });
    if (!book) throw new NotFoundException();
    await this.books.restore({ id: book.id });
    return this.getOwned(authorId, bookId);
  }

  async setCover(
    authorId: string,
    bookId: string,
    coverUrl: string,
  ): Promise<{ previous: string | null; book: BookDto }> {
    const book = await this.findOwnedBook(authorId, bookId);
    const previous = book.coverUrl;
    book.coverUrl = coverUrl;
    await this.books.save(book);
    return { previous, book: await this.toDto(book, false) };
  }

  // ───────────────────────── Chapitres (auteur) ─────────────────────────

  async listChapters(authorId: string, bookId: string): Promise<ChapterDto[]> {
    await this.findOwnedBook(authorId, bookId);
    const rows = await this.chapters.find({ where: { bookId }, order: { position: 'ASC' } });
    return rows.map(toChapterDto);
  }

  async createChapter(
    authorId: string,
    bookId: string,
    dto: CreateChapterDto,
  ): Promise<ChapterDto> {
    const book = await this.findOwnedBook(authorId, bookId);
    const chapter = await this.dataSource.transaction(async (em) => {
      const { max } = (await em
        .createQueryBuilder(Chapter, 'c')
        .select('COALESCE(MAX(c.position), -1)', 'max')
        .where('c.book_id = :bookId', { bookId })
        .getRawOne<{ max: number }>())!;
      const count = await em.count(Chapter, { where: { bookId } });
      const c = await em.save(
        em.create(Chapter, {
          bookId,
          title: dto.title || `Chapitre ${count + 1}`,
          position: Number(max) + 1,
          status: 'draft',
          // Un nouveau chapitre reprend la visibilité du livre.
          visibility: book.visibility,
        }),
      );
      await em.save(
        em.create(ChapterContent, { chapterId: c.id, content: '', contentText: '', version: 0 }),
      );
      await em.update(Book, { id: bookId }, { updatedAt: new Date() });
      return c;
    });
    return toChapterDto(chapter);
  }

  /** Réorganisation en une seule requête SQL : les positions suivent l'ordre reçu. */
  async reorderChapters(
    authorId: string,
    bookId: string,
    chapterIds: string[],
  ): Promise<ChapterDto[]> {
    await this.findOwnedBook(authorId, bookId);
    const existing = await this.chapters.find({ where: { bookId }, select: { id: true } });
    const known = new Set(existing.map((c) => c.id));
    if (known.size !== chapterIds.length || !chapterIds.every((id) => known.has(id))) {
      throw new BadRequestException('La liste doit contenir exactement les chapitres du livre');
    }
    await this.dataSource.query(
      `UPDATE writing.chapters AS c
          SET position = o.ord - 1, updated_at = now()
         FROM unnest($1::uuid[]) WITH ORDINALITY AS o(id, ord)
        WHERE c.id = o.id AND c.book_id = $2`,
      [chapterIds, bookId],
    );
    return this.listChapters(authorId, bookId);
  }

  async updateChapter(
    authorId: string,
    chapterId: string,
    dto: UpdateChapterDto,
  ): Promise<ChapterDto> {
    const chapter = await this.findOwnedChapter(authorId, chapterId);
    if (dto.title !== undefined) chapter.title = dto.title;
    if (dto.visibility !== undefined) chapter.visibility = dto.visibility;
    if (dto.status !== undefined) {
      chapter.status = dto.status;
      if (dto.status === 'published' && !chapter.publishedAt) chapter.publishedAt = new Date();
    }
    await this.chapters.save(chapter);
    return toChapterDto(chapter);
  }

  async removeChapter(authorId: string, chapterId: string): Promise<void> {
    const chapter = await this.findOwnedChapter(authorId, chapterId);
    await this.chapters.softDelete({ id: chapter.id });
    await this.refreshBookWordCount(this.dataSource.manager, chapter.bookId);
  }

  async restoreChapter(authorId: string, chapterId: string): Promise<ChapterDto> {
    const chapter = await this.chapters.findOne({ where: { id: chapterId }, withDeleted: true });
    if (!chapter) throw new NotFoundException();
    await this.findOwnedBook(authorId, chapter.bookId);
    await this.chapters.restore({ id: chapterId });
    await this.refreshBookWordCount(this.dataSource.manager, chapter.bookId);
    chapter.deletedAt = null;
    return toChapterDto(chapter);
  }

  async getContent(authorId: string, chapterId: string): Promise<ChapterContentDto> {
    await this.findOwnedChapter(authorId, chapterId);
    const c = await this.contents.findOneByOrFail({ chapterId });
    return {
      chapterId,
      content: c.content,
      version: c.version,
      updatedAt: c.updatedAt.toISOString(),
    };
  }

  /**
   * Sauvegarde automatique. Aucune perte : si le client écrit à partir d'une version
   * plus ancienne (édition hors ligne sur deux appareils), la version écrasée est
   * conservée dans l'historique avant d'être remplacée.
   */
  async saveContent(
    authorId: string,
    chapterId: string,
    dto: SaveContentDto,
  ): Promise<ChapterContentDto> {
    const chapter = await this.findOwnedChapter(authorId, chapterId);
    return this.dataSource.transaction(async (em) => {
      const current = await em.findOne(ChapterContent, {
        where: { chapterId },
        lock: { mode: 'pessimistic_write' },
      });
      const row =
        current ??
        em.create(ChapterContent, { chapterId, content: '', contentText: '', version: 0 });
      if (row.content === dto.content) {
        return {
          chapterId,
          content: row.content,
          version: row.version,
          updatedAt: (row.updatedAt ?? new Date()).toISOString(),
        };
      }
      const conflict = dto.baseVersion !== undefined && dto.baseVersion < row.version;
      const last = await em.findOne(ChapterVersion, {
        where: { chapterId },
        order: { createdAt: 'DESC' },
      });
      const stale = !last || Date.now() - last.createdAt.getTime() > SNAPSHOT_INTERVAL_MS;
      if (row.content && (conflict || stale)) {
        await em.save(
          em.create(ChapterVersion, { chapterId, content: row.content, version: row.version }),
        );
      }
      row.content = dto.content;
      row.contentText = toPlainText(dto.content);
      row.version += 1;
      const saved = await em.save(row);
      await em.update(
        Chapter,
        { id: chapterId },
        { wordCount: countWords(dto.content), updatedAt: new Date() },
      );
      await this.refreshBookWordCount(em, chapter.bookId);
      return {
        chapterId,
        content: saved.content,
        version: saved.version,
        updatedAt: saved.updatedAt.toISOString(),
      };
    });
  }

  // ───────────────────────── Lecture (pour les autres domaines) ─────────────────────────

  async findBookMeta(bookId: string): Promise<(BookMeta & { book: Book }) | null> {
    const book = await this.books.findOneBy({ id: bookId });
    return book
      ? {
          id: book.id,
          authorId: book.authorId,
          visibility: book.visibility,
          status: book.status,
          book,
        }
      : null;
  }

  async findChapterMeta(chapterId: string): Promise<(ChapterMeta & { chapter: Chapter }) | null> {
    const chapter = await this.chapters.findOneBy({ id: chapterId });
    return chapter
      ? {
          id: chapter.id,
          bookId: chapter.bookId,
          visibility: chapter.visibility,
          status: chapter.status,
          chapter,
        }
      : null;
  }

  async listChapterEntities(bookId: string): Promise<Chapter[]> {
    return this.chapters.find({ where: { bookId }, order: { position: 'ASC' } });
  }

  async getChapterText(chapterId: string): Promise<string> {
    const c = await this.contents.findOneBy({ chapterId });
    return c?.content ?? '';
  }

  async bookToDto(book: Book, opts: { onlyVisibleChapters: boolean }): Promise<BookDto> {
    return this.toDto(book, opts.onlyVisibleChapters);
  }

  /** Livres non supprimés, dans l'ordre des identifiants demandés. */
  async findBooksByIds(ids: string[]): Promise<Book[]> {
    if (!ids.length) return [];
    const rows = await this.books.findBy({ id: In(ids) });
    const byId = new Map(rows.map((b) => [b.id, b]));
    return ids.map((id) => byId.get(id)).filter((b): b is Book => !!b);
  }

  async booksToDtos(books: Book[], opts: { onlyVisibleChapters: boolean }): Promise<BookDto[]> {
    return this.decorate(books, opts);
  }

  /**
   * Catalogue public : livres publics, hors brouillons, triés par date de publication.
   * Pagination par curseur (published_at, id) — jamais d'OFFSET.
   */
  async searchPublic(query: CatalogQuery): Promise<Book[]> {
    const qb = this.books
      .createQueryBuilder('b')
      .where("b.visibility = 'public'")
      .andWhere("b.status <> 'draft'")
      .andWhere('b.published_at IS NOT NULL')
      .andWhere('b.hidden_at IS NULL');
    if (query.genre) qb.andWhere('b.genre = :genre', { genre: query.genre });
    const q = query.q;
    if (q) {
      const authorIds = query.authorIds ?? [];
      qb.andWhere(
        new Brackets((w) => {
          w.where(`b.search @@ websearch_to_tsquery('simple', :q)`, { q })
            .orWhere('b.title ILIKE :like', { like: `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%` })
            .orWhere(
              `EXISTS (SELECT 1 FROM writing.book_tags bt JOIN writing.tags t ON t.id = bt.tag_id
                        WHERE bt.book_id = b.id AND t.name = :tag)`,
              { tag: q },
            );
          if (authorIds.length) w.orWhere('b.author_id IN (:...authorIds)', { authorIds });
        }),
      );
    }
    if (query.after) {
      qb.andWhere('(b.published_at, b.id) < (:afterDate, :afterId)', {
        afterDate: query.after.publishedAt,
        afterId: query.after.id,
      });
    }
    return qb
      .orderBy('b.published_at', 'DESC')
      .addOrderBy('b.id', 'DESC')
      .limit(query.limit)
      .getMany();
  }

  async publicBooksByAuthor(authorId: string): Promise<BookDto[]> {
    const books = await this.books.find({
      where: { authorId, visibility: 'public', status: Not('draft'), hiddenAt: IsNull() },
      order: { publishedAt: 'DESC' },
    });
    return this.decorate(books, { onlyVisibleChapters: true });
  }

  async genreCounts(): Promise<{ genre: string; count: number }[]> {
    const rows = await this.books
      .createQueryBuilder('b')
      .select('b.genre', 'genre')
      .addSelect('COUNT(*)::int', 'count')
      .where(
        "b.visibility = 'public' AND b.status <> 'draft' AND b.genre IS NOT NULL AND b.hidden_at IS NULL",
      )
      .groupBy('b.genre')
      .orderBy('count', 'DESC')
      .getRawMany<{ genre: string; count: number }>();
    return rows;
  }

  // ───────────────────────── Modération (appelée par le domaine moderation) ─────────────────────────

  /** Masque ou rétablit un livre. Renvoie faux si le livre n'existe pas. */
  async setBookHidden(bookId: string, hidden: boolean): Promise<boolean> {
    const res = await this.books.update({ id: bookId }, { hiddenAt: hidden ? new Date() : null });
    return !!res.affected;
  }

  async setChapterHidden(chapterId: string, hidden: boolean): Promise<boolean> {
    const res = await this.chapters.update(
      { id: chapterId },
      { hiddenAt: hidden ? new Date() : null },
    );
    return !!res.affected;
  }

  async countBooksByAuthors(authorIds: string[]): Promise<Map<string, number>> {
    if (!authorIds.length) return new Map();
    const rows = await this.books
      .createQueryBuilder('b')
      .select('b.author_id', 'authorId')
      .addSelect('COUNT(*)::int', 'count')
      .where('b.author_id IN (:...authorIds)', { authorIds })
      .groupBy('b.author_id')
      .getRawMany<{ authorId: string; count: number }>();
    return new Map(rows.map((r) => [r.authorId, r.count]));
  }

  async stats() {
    const [row] = await this.dataSource.query(
      `SELECT
         (SELECT COUNT(*)::int FROM writing.books WHERE deleted_at IS NULL) AS books,
         (SELECT COUNT(*)::int FROM writing.books WHERE deleted_at IS NULL AND visibility = 'public' AND status <> 'draft') AS public_books,
         (SELECT COUNT(*)::int FROM writing.books WHERE deleted_at IS NULL AND created_at > now() - interval '7 days') AS new_books,
         (SELECT COUNT(*)::int FROM writing.books WHERE deleted_at IS NULL AND hidden_at IS NOT NULL) AS hidden_books,
         (SELECT COUNT(*)::int FROM writing.chapters WHERE deleted_at IS NULL) AS chapters,
         (SELECT COUNT(*)::int FROM writing.chapters WHERE deleted_at IS NULL AND status = 'published') AS published_chapters,
         (SELECT COALESCE(SUM(word_count), 0)::int FROM writing.books WHERE deleted_at IS NULL) AS words`,
    );
    return {
      books: {
        total: row.books,
        public: row.public_books,
        new7d: row.new_books,
        hidden: row.hidden_books,
      },
      chapters: { total: row.chapters, published: row.published_chapters },
      words: row.words,
    };
  }

  // ───────────────────────── Événements ─────────────────────────

  @OnEvent(Events.UserDeleted, { async: true, promisify: true })
  async onUserDeleted({ userId }: UserDeletedEvent): Promise<void> {
    const books = await this.books.find({
      where: { authorId: userId },
      withDeleted: true,
      relations: { chapters: true },
    });
    for (const b of books) {
      await this.storage.remove(b.coverUrl);
      await this.events.emitAsync(Events.BookDeleted, {
        bookId: b.id,
        chapterIds: (b.chapters ?? []).map((c) => c.id),
      } satisfies BookDeletedEvent);
    }
    // Suppression définitive : les chapitres et contenus suivent par clé étrangère.
    await this.books.delete({ authorId: userId });
  }

  @OnEvent(Events.UserExport, { async: true, promisify: true })
  async onUserExport({ userId }: UserExportEvent) {
    const books = await this.books.find({
      where: { authorId: userId },
      relations: { chapters: { content: true } },
    });
    return {
      writing: books.map((b) => ({
        id: b.id,
        title: b.title,
        summary: b.summary,
        genre: b.genre,
        status: b.status,
        visibility: b.visibility,
        createdAt: b.createdAt,
        chapters: (b.chapters ?? [])
          .sort((a, c) => a.position - c.position)
          .map((c) => ({
            id: c.id,
            title: c.title,
            status: c.status,
            visibility: c.visibility,
            content: c.content?.content ?? '',
          })),
      })),
    };
  }

  // ───────────────────────── interne ─────────────────────────

  private async findOwnedBook(authorId: string, bookId: string): Promise<Book> {
    const book = await this.books.findOneBy({ id: bookId, authorId });
    // 404 et non 403 : on ne révèle pas l'existence du livre.
    if (!book) throw new NotFoundException();
    return book;
  }

  private async findOwnedChapter(authorId: string, chapterId: string): Promise<Chapter> {
    const chapter = await this.chapters.findOne({
      where: { id: chapterId },
      relations: { book: true },
    });
    if (!chapter || !chapter.book || chapter.book.authorId !== authorId || chapter.book.deletedAt) {
      throw new NotFoundException();
    }
    return chapter;
  }

  private async refreshBookWordCount(em: EntityManager, bookId: string): Promise<void> {
    await em.query(
      `UPDATE writing.books SET word_count = COALESCE(
         (SELECT SUM(word_count) FROM writing.chapters WHERE book_id = $1 AND deleted_at IS NULL), 0),
         updated_at = now()
       WHERE id = $1`,
      [bookId],
    );
  }

  private async setTags(em: EntityManager, bookId: string, raw: string[]): Promise<void> {
    const names = [...new Set(raw.map((t) => t.trim().toLowerCase()).filter(Boolean))];
    await em.delete(BookTag, { bookId });
    if (!names.length) return;
    await em
      .createQueryBuilder()
      .insert()
      .into(Tag)
      .values(names.map((name) => em.create(Tag, { name })))
      .orIgnore()
      .execute();
    const tags = await em.findBy(Tag, { name: In(names) });
    await em.save(tags.map((t) => em.create(BookTag, { bookId, tagId: t.id })));
  }

  private async toDto(book: Book, onlyVisibleChapters: boolean): Promise<BookDto> {
    const [dto] = await this.decorate([book], { onlyVisibleChapters });
    return dto;
  }

  /** Ajoute nombre de chapitres et étiquettes, en deux requêtes pour toute la liste. */
  private async decorate(
    books: Book[],
    opts: { onlyVisibleChapters: boolean },
  ): Promise<BookDto[]> {
    if (!books.length) return [];
    const ids = books.map((b) => b.id);
    const counts = await this.chapters
      .createQueryBuilder('c')
      .select('c.book_id', 'bookId')
      .addSelect('COUNT(*)::int', 'count')
      .where('c.book_id IN (:...ids)', { ids })
      .andWhere(opts.onlyVisibleChapters ? "c.status <> 'draft'" : '1=1')
      .groupBy('c.book_id')
      .getRawMany<{ bookId: string; count: number }>();
    const tagRows = await this.dataSource
      .getRepository(BookTag)
      .find({ where: { bookId: In(ids) }, relations: { tag: true } });
    const countBy = new Map(counts.map((r) => [r.bookId, r.count]));
    const tagsBy = new Map<string, string[]>();
    for (const bt of tagRows) {
      tagsBy.set(bt.bookId, [...(tagsBy.get(bt.bookId) ?? []), bt.tag!.name]);
    }
    return books.map((b) =>
      toBookDto(b, { chapterCount: countBy.get(b.id) ?? 0, tags: (tagsBy.get(b.id) ?? []).sort() }),
    );
  }
}
