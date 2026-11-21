import { Column, Entity, Index, JoinColumn, OneToOne, PrimaryColumn } from 'typeorm';
import { Timestamped } from '../../database/base.entity';
import { User } from './user.entity';

@Entity({ schema: 'identity', name: 'profiles' })
export class Profile extends Timestamped {
  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId: string;

  @OneToOne(() => User, (u) => u.profile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  @Index('uq_profiles_username', { unique: true })
  @Column({ type: 'citext' })
  username: string;

  @Column({ name: 'display_name', type: 'varchar', length: 80 })
  displayName: string;

  @Column({ name: 'avatar_url', type: 'text', nullable: true })
  avatarUrl: string | null;

  @Column({ type: 'text', nullable: true })
  bio: string | null;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  links: string[];
}
