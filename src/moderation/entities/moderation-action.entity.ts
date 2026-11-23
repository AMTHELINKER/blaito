import { Column, Entity, Index } from 'typeorm';
import type { ModerationActionType, ReportTargetType } from '../../shared';
import { UuidEntity } from '../../database/base.entity';
import { reportTargetTypeColumn } from './enums';

/** Journal des décisions de modération (qui a fait quoi, sur quoi, pourquoi). */
@Entity({ schema: 'moderation', name: 'moderation_actions' })
@Index('idx_moderation_actions_created', ['createdAt'])
@Index('idx_moderation_actions_target', ['targetType', 'targetId'])
export class ModerationAction extends UuidEntity {
  @Column({ name: 'moderator_id', type: 'uuid' })
  moderatorId: string;

  @Column({
    type: 'enum',
    enum: [
      'hide_content',
      'unhide_content',
      'suspend_user',
      'reinstate_user',
      'dismiss_report',
      'change_role',
      'delete_user',
    ],
    enumName: 'moderation_action_type',
  })
  action: ModerationActionType;

  @Column(reportTargetTypeColumn)
  targetType: ReportTargetType;

  @Column({ name: 'target_id', type: 'uuid' })
  targetId: string;

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @Column({ name: 'report_id', type: 'uuid', nullable: true })
  reportId: string | null;
}
