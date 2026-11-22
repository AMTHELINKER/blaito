import type { BookDto, ChapterDto } from '../shared';
import type { Book } from './entities/book.entity';
import type { Chapter } from './entities/chapter.entity';

export function toBookDto(
  b: Book,
  extra: { chapterCount: number; tags: string[]; author?: BookDto['author'] },
): BookDto {
  return {
    id: b.id,
    authorId: b.authorId,
    title: b.title,
    slug: b.slug,
    summary: b.summary,
    coverUrl: b.coverUrl,
    genre: b.genre,
    tags: extra.tags,
    status: b.status,
    visibility: b.visibility,
    publishedAt: b.publishedAt?.toISOString() ?? null,
    createdAt: b.createdAt.toISOString(),
    updatedAt: b.updatedAt.toISOString(),
    chapterCount: extra.chapterCount,
    wordCount: b.wordCount,
    hiddenAt: b.hiddenAt?.toISOString() ?? null,
    ...(extra.author && { author: extra.author }),
  };
}

export function toChapterDto(c: Chapter): ChapterDto {
  return {
    id: c.id,
    bookId: c.bookId,
    title: c.title,
    position: c.position,
    status: c.status,
    visibility: c.visibility,
    wordCount: c.wordCount,
    publishedAt: c.publishedAt?.toISOString() ?? null,
    updatedAt: c.updatedAt.toISOString(),
    hiddenAt: c.hiddenAt?.toISOString() ?? null,
  };
}
