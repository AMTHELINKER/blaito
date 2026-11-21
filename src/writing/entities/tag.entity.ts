import { Column, Entity, Index } from 'typeorm';
import { UuidEntity } from '../../database/base.entity';

@Entity({ schema: 'writing', name: 'tags' })
export class Tag extends UuidEntity {
  @Index('uq_tags_name', { unique: true })
  @Column({ type: 'citext' })
  name: string;
}
