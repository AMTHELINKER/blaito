import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import type { MemberRole } from '../../shared';
import { Timestamped } from '../../database/base.entity';
import { Conversation } from './conversation.entity';

@Entity({ schema: 'messaging', name: 'conversation_members' })
@Index('idx_conversation_members_user', ['userId'])
export class ConversationMember extends Timestamped {
  @PrimaryColumn({ name: 'conversation_id', type: 'uuid' })
  conversationId: string;

  @ManyToOne(() => Conversation, (c) => c.members, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'conversation_id' })
  conversation?: Conversation;

  /** Référence vers identity.users — sans clé étrangère. */
  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({
    type: 'enum',
    enum: ['owner', 'admin', 'member'],
    enumName: 'member_role',
    default: 'member',
  })
  role: MemberRole;

  /** Tout message plus récent (d'un autre membre) est non lu. */
  @Column({ name: 'last_read_at', type: 'timestamptz', nullable: true })
  lastReadAt: Date | null;
}
