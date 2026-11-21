import { Column, Entity, Index, OneToMany } from 'typeorm';
import type { Visibility, WritingStatus } from '../../shared';
import { SoftDeletableEntity } from '../../database/base.entity';
import { BookTag } from './book-tag.entity';
import { Chapter } from './chapter.entity';
import { visibilityColumn, writingStatusColumn } from './enums';

@Entity({ schema: 'writing', name: 'books' })
@Index('idx_books_public_recent', ['visibility', 'publishedAt'])
export class Book extends SoftDeletableEntity {
  /** Référence vers identity.users — sans clé étrangère (domaines séparés). */
  @Index('idx_books_author')
  @Column({ name: 'author_id', type: 'uuid' })
  authorId: string;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Index('idx_books_slug')
  @Column({ type: 'varchar', length: 100 })
  slug: string;

  @Column({ type: 'text', nullable: true })
  summary: string | null;

  @Column({ name: 'cover_url', type: 'text', nullable: true })
  coverUrl: string | null;

  @Column({ type: 'varchar', length: 40, nullable: true })
  genre: string | null;

  @Column(writingStatusColumn)
  status: WritingStatus;

  @Column(visibilityColumn)
  visibility: Visibility;

  @Column({ name: 'published_at', type: 'timestamptz', nullable: true })
  publishedAt: Date | null;

  /** Compteur dénormalisé (somme des chapitres non supprimés). */
  @Column({ name: 'word_count', type: 'integer', default: 0 })
  wordCount: number;

  /** Vecteur de recherche plein texte (index GIN créé par migration). */
  @Index('idx_books_search', { synchronize: false })
  @Column({
    type: 'tsvector',
    select: false,
    insert: false,
    update: false,
    generatedType: 'STORED',
    asExpression: `setweight(to_tsvector('simple', coalesce("title", '')), 'A') || setweight(to_tsvector('simple', coalesce("summary", '')), 'B')`,
  })
  search?: string;

  @OneToMany(() => Chapter, (c) => c.book)
  chapters?: Chapter[];

  @OneToMany(() => BookTag, (bt) => bt.book)
  bookTags?: BookTag[];
}
