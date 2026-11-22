import { Column, Entity, Index, JoinColumn, ManyToOne, OneToOne } from 'typeorm';
import type { Visibility, WritingStatus } from '../../shared';
import { SoftDeletableEntity } from '../../database/base.entity';
import { Book } from './book.entity';
import { ChapterContent } from './chapter-content.entity';
import { visibilityColumn, writingStatusColumn } from './enums';

/** Métadonnées d'un chapitre : la liste se charge sans lire les textes complets. */
@Entity({ schema: 'writing', name: 'chapters' })
@Index('idx_chapters_book_position', ['bookId', 'position'])
export class Chapter extends SoftDeletableEntity {
  @Column({ name: 'book_id', type: 'uuid' })
  bookId: string;

  @ManyToOne(() => Book, (b) => b.chapters, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'book_id' })
  book?: Book;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({ type: 'integer' })
  position: number;

  @Column(writingStatusColumn)
  status: WritingStatus;

  @Column(visibilityColumn)
  visibility: Visibility;

  @Column({ name: 'word_count', type: 'integer', default: 0 })
  wordCount: number;

  @Column({ name: 'published_at', type: 'timestamptz', nullable: true })
  publishedAt: Date | null;

  /** Masqué par la modération : invisible pour tous sauf l'auteur. */
  @Column({ name: 'hidden_at', type: 'timestamptz', nullable: true })
  hiddenAt: Date | null;

  @OneToOne(() => ChapterContent, (c) => c.chapter)
  content?: ChapterContent;
}
