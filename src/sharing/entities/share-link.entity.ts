import { Column, Entity, Index } from 'typeorm';
import type { ResourceType } from '../../shared';
import { UuidEntity } from '../../database/base.entity';

export const resourceTypeColumn = {
  name: 'resource_type',
  type: 'enum' as const,
  enum: ['book', 'chapter'],
  enumName: 'resource_type',
};

@Entity({ schema: 'sharing', name: 'share_links' })
@Index('idx_share_links_resource', ['resourceType', 'resourceId'])
export class ShareLink extends UuidEntity {
  @Column(resourceTypeColumn)
  resourceType: ResourceType;

  /** Référence vers writing.books / writing.chapters — sans clé étrangère. */
  @Column({ name: 'resource_id', type: 'uuid' })
  resourceId: string;

  @Index('uq_share_links_token', { unique: true })
  @Column({ type: 'varchar', length: 64 })
  token: string;

  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true })
  expiresAt: Date | null;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt: Date | null;
}
