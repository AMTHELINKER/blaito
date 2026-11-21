import { Entity, Index, PrimaryColumn } from 'typeorm';
import { Timestamped } from '../../database/base.entity';

/** Livres mis en favoris (V1 — table prête). */
@Entity({ schema: 'library', name: 'bookmarks' })
@Index('idx_bookmarks_user_recent', ['userId', 'createdAt'])
export class Bookmark extends Timestamped {
  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId: string;

  @PrimaryColumn({ name: 'book_id', type: 'uuid' })
  bookId: string;
}
