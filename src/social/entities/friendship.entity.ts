import { Column, Entity, Index } from 'typeorm';
import type { FriendshipStatus } from '../../shared';
import { UuidEntity } from '../../database/base.entity';

@Entity({ schema: 'social', name: 'friendships' })
@Index('uq_friendships_pair', ['requesterId', 'addresseeId'], { unique: true })
@Index('idx_friendships_addressee', ['addresseeId'])
export class Friendship extends UuidEntity {
  /** Références vers identity.users — sans clé étrangère. */
  @Column({ name: 'requester_id', type: 'uuid' })
  requesterId: string;

  @Column({ name: 'addressee_id', type: 'uuid' })
  addresseeId: string;

  @Column({
    type: 'enum',
    enum: ['pending', 'accepted', 'blocked'],
    enumName: 'friendship_status',
    default: 'pending',
  })
  status: FriendshipStatus;
}
