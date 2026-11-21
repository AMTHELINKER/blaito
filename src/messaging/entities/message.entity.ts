import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { SoftDeletableEntity } from '../../database/base.entity';
import { Conversation } from './conversation.entity';

/** Les identifiants UUID v7 sont triés dans le temps : ils servent de curseur de pagination. */
@Entity({ schema: 'messaging', name: 'messages' })
@Index('idx_messages_conversation', ['conversationId', 'id'])
@Index('idx_messages_sender', ['senderId'])
export class Message extends SoftDeletableEntity {
  @Column({ name: 'conversation_id', type: 'uuid' })
  conversationId: string;

  @ManyToOne(() => Conversation, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'conversation_id' })
  conversation?: Conversation;

  /** Référence vers identity.users — sans clé étrangère. */
  @Column({ name: 'sender_id', type: 'uuid' })
  senderId: string;

  @Column({ type: 'text' })
  body: string;

  @Column({ name: 'client_id', type: 'varchar', length: 64, nullable: true })
  clientId: string | null;
}
