import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { UuidEntity } from '../../database/base.entity';
import { User } from './user.entity';

export type UserTokenType = 'email_verification' | 'password_reset';

/** Jetons à usage unique (vérification d'e-mail, réinitialisation du mot de passe), stockés hachés. */
@Entity({ schema: 'identity', name: 'user_tokens' })
export class UserToken extends UuidEntity {
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  @Column({
    type: 'enum',
    enum: ['email_verification', 'password_reset'],
    enumName: 'user_token_type',
  })
  type: UserTokenType;

  @Index('uq_user_tokens_hash', { unique: true })
  @Column({ name: 'token_hash', type: 'char', length: 64 })
  tokenHash: string;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ name: 'used_at', type: 'timestamptz', nullable: true })
  usedAt: Date | null;
}
