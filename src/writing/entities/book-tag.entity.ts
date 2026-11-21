import { Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { Timestamped } from '../../database/base.entity';
import { Book } from './book.entity';
import { Tag } from './tag.entity';

@Entity({ schema: 'writing', name: 'book_tags' })
export class BookTag extends Timestamped {
  @PrimaryColumn({ name: 'book_id', type: 'uuid' })
  bookId: string;

  @Index('idx_book_tags_tag')
  @PrimaryColumn({ name: 'tag_id', type: 'uuid' })
  tagId: string;

  @ManyToOne(() => Book, (b) => b.bookTags, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'book_id' })
  book?: Book;

  @ManyToOne(() => Tag, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tag_id' })
  tag?: Tag;
}
