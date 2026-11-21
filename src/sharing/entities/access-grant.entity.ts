import { Column, Entity, Index } from 'typeorm';
import type { GrantPermission, ResourceType } from '../../shared';
import { UuidEntity } from '../../database/base.entity';
import { resourceTypeColumn } from './share-link.entity';

/** Invitation d'un lecteur précis sur un livre ou un chapitre. */
@Entity({ schema: 'sharing', name: 'access_grants' })
@Index('uq_access_grants', ['resourceType', 'resourceId', 'granteeUserId'], { unique: true })
@Index('idx_access_grants_grantee', ['granteeUserId', 'createdAt'])
export class AccessGrant extends UuidEntity {
  @Column(resourceTypeColumn)
  resourceType: ResourceType;

  @Column({ name: 'resource_id', type: 'uuid' })
  resourceId: string;

  @Column({ name: 'grantee_user_id', type: 'uuid' })
  granteeUserId: string;

  @Column({
    type: 'enum',
    enum: ['read', 'comment'],
    enumName: 'grant_permission',
    default: 'read',
  })
  permission: GrantPermission;
}
