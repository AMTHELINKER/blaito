import { Column, Entity, JoinColumn, OneToOne, PrimaryColumn } from 'typeorm';
import { Timestamped } from '../../database/base.entity';
import { Chapter } from './chapter.entity';

@Entity({ schema: 'writing', name: 'chapter_contents' })
export class ChapterContent extends Timestamped {
  @PrimaryColumn({ name: 'chapter_id', type: 'uuid' })
  chapterId: string;

  @OneToOne(() => Chapter, (c) => c.content, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'chapter_id' })
  chapter?: Chapter;

  /** Texte tel que saisi (syntaxe légère, voir src/shared/text.ts). */
  @Column({ type: 'text', default: '' })
  content: string;

  /** Texte brut, pour la recherche. */
  @Column({ name: 'content_text', type: 'text', default: '' })
  contentText: string;

  @Column({ type: 'integer', default: 0 })
  version: number;
}
