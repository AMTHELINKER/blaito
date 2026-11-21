import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { UuidEntity } from '../../database/base.entity';
import { User } from './user.entity';

@Entity({ schema: 'identity', name: 'sessions' })
export class Session extends UuidEntity {
  @Index('idx_sessions_user')
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  @Column({ name: 'refresh_token_hash', type: 'char', length: 64 })
  refreshTokenHash: string;

  @Column({ name: 'user_agent', type: 'text', nullable: true })
  userAgent: string | null;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;
}
