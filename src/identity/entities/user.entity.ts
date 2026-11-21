import { Column, Entity, Index, OneToOne } from 'typeorm';
import type { UserRole, UserStatus } from '../../shared';
import { UuidEntity } from '../../database/base.entity';
import { Profile } from './profile.entity';
import { UserSettings } from './user-settings.entity';

@Entity({ schema: 'identity', name: 'users' })
export class User extends UuidEntity {
  @Index('uq_users_email', { unique: true })
  @Column({ type: 'citext' })
  email: string;

  @Column({ name: 'password_hash', type: 'text' })
  passwordHash: string;

  @Column({ name: 'email_verified_at', type: 'timestamptz', nullable: true })
  emailVerifiedAt: Date | null;

  @Column({
    type: 'enum',
    enum: ['user', 'moderator', 'admin'],
    enumName: 'user_role',
    default: 'user',
  })
  role: UserRole;

  @Column({ type: 'enum', enum: ['active', 'suspended'], enumName: 'user_status', default: 'active' })
  status: UserStatus;

  @OneToOne(() => Profile, (p) => p.user)
  profile?: Profile;

  @OneToOne(() => UserSettings, (s) => s.user)
  settings?: UserSettings;
}
