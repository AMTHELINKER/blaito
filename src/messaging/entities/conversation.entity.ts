import { Column, Entity, Index, OneToMany } from 'typeorm';
import type { ConversationType } from '../../shared';
import { UuidEntity } from '../../database/base.entity';
import { ConversationMember } from './conversation-member.entity';

@Entity({ schema: 'messaging', name: 'conversations' })
@Index('idx_conversations_last_message', ['lastMessageAt'])
export class Conversation extends UuidEntity {
  @Column({ type: 'enum', enum: ['direct', 'group'], enumName: 'conversation_type' })
  type: ConversationType;

  /** Titre d'un groupe ; null pour une conversation privée. */
  @Column({ type: 'varchar', length: 80, nullable: true })
  title: string | null;

  /** Référence vers identity.users — sans clé étrangère. */
  @Column({ name: 'created_by', type: 'uuid' })
  createdBy: string;

  /** Conversation privée : « idA:idB » (ordre croissant), unique — une seule conversation par paire. */
  @Index('uq_conversations_direct_key', { unique: true })
  @Column({ name: 'direct_key', type: 'varchar', length: 80, nullable: true })
  directKey: string | null;

  /** Compteur dénormalisé pour trier les conversations sans lire les messages. */
  @Column({ name: 'last_message_at', type: 'timestamptz', nullable: true })
  lastMessageAt: Date | null;

  @OneToMany(() => ConversationMember, (m) => m.conversation)
  members?: ConversationMember[];
}
