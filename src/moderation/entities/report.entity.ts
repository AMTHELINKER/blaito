import { Column, Entity, Index } from 'typeorm';
import type { ReportReason, ReportStatus, ReportTargetType } from '../../shared';
import { UuidEntity } from '../../database/base.entity';
import { reportTargetTypeColumn } from './enums';

/** Signalement d'un contenu ou d'une personne par un utilisateur. */
@Entity({ schema: 'moderation', name: 'reports' })
@Index('idx_reports_status_created', ['status', 'createdAt'])
@Index('idx_reports_target', ['targetType', 'targetId'])
// Un seul signalement ouvert par personne et par cible.
@Index('uq_reports_open_per_reporter', ['reporterId', 'targetType', 'targetId'], {
  unique: true,
  where: `"status" = 'open'`,
})
export class Report extends UuidEntity {
  /** Références vers les autres domaines — sans clé étrangère. */
  @Column({ name: 'reporter_id', type: 'uuid' })
  reporterId: string;

  @Column(reportTargetTypeColumn)
  targetType: ReportTargetType;

  @Column({ name: 'target_id', type: 'uuid' })
  targetId: string;

  @Column({
    type: 'enum',
    enum: ['spam', 'harassment', 'inappropriate', 'copyright', 'other'],
    enumName: 'report_reason',
  })
  reason: ReportReason;

  @Column({ type: 'text', nullable: true })
  details: string | null;

  @Column({
    type: 'enum',
    enum: ['open', 'resolved', 'dismissed'],
    enumName: 'report_status',
    default: 'open',
  })
  status: ReportStatus;

  @Column({ name: 'resolved_by', type: 'uuid', nullable: true })
  resolvedBy: string | null;

  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true })
  resolvedAt: Date | null;
}
