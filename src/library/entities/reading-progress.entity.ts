import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import { Timestamped } from '../../database/base.entity';

/** Position de lecture, synchronisée entre appareils. */
@Entity({ schema: 'library', name: 'reading_progress' })
@Index('idx_reading_progress_user_recent', ['userId', 'updatedAt'])
@Index('idx_reading_progress_book_recent', ['bookId', 'updatedAt'])
export class ReadingProgress extends Timestamped {
  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId: string;

  @PrimaryColumn({ name: 'book_id', type: 'uuid' })
  bookId: string;

  @Column({ name: 'chapter_id', type: 'uuid' })
  chapterId: string;

  /** Index du paragraphe atteint dans le chapitre. */
  @Column({ type: 'integer', default: 0 })
  position: number;
}
