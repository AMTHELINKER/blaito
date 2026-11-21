import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { UuidEntity } from '../../database/base.entity';
import { Chapter } from './chapter.entity';

/** Instantanés du contenu (historique des versions). */
@Entity({ schema: 'writing', name: 'chapter_versions' })
@Index('idx_chapter_versions_chapter', ['chapterId', 'createdAt'])
export class ChapterVersion extends UuidEntity {
  @Column({ name: 'chapter_id', type: 'uuid' })
  chapterId: string;

  @ManyToOne(() => Chapter, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'chapter_id' })
  chapter?: Chapter;

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'integer' })
  version: number;
}
