import { Column, Entity, JoinColumn, OneToOne, PrimaryColumn } from 'typeorm';
import type { Locale, ReadingPreferences, ThemeName } from '../../shared';
import { Timestamped } from '../../database/base.entity';
import { User } from './user.entity';

@Entity({ schema: 'identity', name: 'user_settings' })
export class UserSettings extends Timestamped {
  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId: string;

  @OneToOne(() => User, (u) => u.settings, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  @Column({ type: 'varchar', length: 8, default: 'fr' })
  locale: Locale;

  @Column({ type: 'varchar', length: 16, default: 'parchment' })
  theme: ThemeName;

  @Column({ name: 'notifications_enabled', type: 'boolean', default: true })
  notificationsEnabled: boolean;

  @Column({ name: 'onboarding_completed', type: 'boolean', default: false })
  onboardingCompleted: boolean;

  @Column({ name: 'reading_preferences', type: 'jsonb', default: () => "'{}'" })
  readingPreferences: Partial<ReadingPreferences>;
}
