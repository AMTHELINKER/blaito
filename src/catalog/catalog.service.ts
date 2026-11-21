import { Injectable, NotFoundException } from '@nestjs/common';
import type { BookDto, Paginated } from '../shared';
import { decodeCursor, encodeCursor } from '../common/cursor';
import { UsersService } from '../identity/users.service';
import { LibraryService } from '../library/library.service';
import { WritingService } from '../writing/writing.service';
import type { Book } from '../writing/entities/book.entity';

export interface CatalogParams {
  q?: string;
  genre?: string;
  sort?: 'recent' | 'trending';
  cursor?: string;
  limit?: number;
}

/** Couche de composition : catalogue public et profils auteurs, à partir des services des domaines. */
@Injectable()
export class CatalogService {
  constructor(
    private readonly writing: WritingService,
    private readonly users: UsersService,
    private readonly library: LibraryService,
  ) {}

  async search(p: CatalogParams): Promise<Paginated<BookDto>> {
    const limit = Math.min(Math.max(p.limit ?? 20, 1), 50);
    const q = p.q?.trim().slice(0, 100) || undefined;

    if (p.sort === 'trending' && !q) {
      // Classement précalculé : le curseur est la position dans ce classement.
      const ids = await this.library.trendingBookIds();
      // Sans activité de lecture récente, les tendances retombent sur les nouveautés.
      if (!ids.length) return this.search({ ...p, sort: 'recent' });
      const start = decodeCursor<[number]>(p.cursor)?.[0] ?? 0;
      const books = (await this.writing.findBooksByIds(ids)).filter(
        (b) => b.visibility === 'public' && b.status !== 'draft' && (!p.genre || b.genre === p.genre),
      );
      const page = books.slice(start, start + limit);
      return {
        items: await this.withAuthors(page),
        nextCursor: start + limit < books.length ? encodeCursor([start + limit]) : null,
      };
    }

    const after = decodeCursor<[string, string]>(p.cursor);
    const authorIds = q ? await this.users.searchUserIds(q) : undefined;
    const rows = await this.writing.searchPublic({
      q,
      genre: p.genre,
      authorIds,
      after: after ? { publishedAt: after[0], id: after[1] } : null,
      limit: limit + 1,
    });
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    return {
      items: await this.withAuthors(page),
      nextCursor: rows.length > limit && last ? encodeCursor([last.publishedAt!.toISOString(), last.id]) : null,
    };
  }

  genres() {
    return this.writing.genreCounts();
  }

  async profile(username: string) {
    const profile = await this.users.findProfileByUsername(username);
    if (!profile) throw new NotFoundException();
    const books = await this.writing.publicBooksByAuthor(profile.userId);
    const author = {
      userId: profile.userId,
      username: profile.username,
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl,
    };
    return { profile, books: books.map((b) => ({ ...b, author })) };
  }

  private async withAuthors(books: Book[]): Promise<BookDto[]> {
    const dtos = await this.writing.booksToDtos(books, { onlyVisibleChapters: true });
    const authors = await this.users.getPublicProfiles(books.map((b) => b.authorId));
    return dtos.map((d) => ({ ...d, author: authors.get(d.authorId) }));
  }
}
