import { Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Namespace, Socket } from 'socket.io';
import { Repository } from 'typeorm';
import type { AccessTokenPayload } from '../common/auth/auth-user';
import { Events, type FriendshipChangedEvent, type UserSuspendedEvent } from '../common/events';
import { MessagingEvents, type TypingEvent } from '../shared';
import { ConversationMember } from './entities/conversation-member.entity';

const userRoom = (userId: string) => `user:${userId}`;
const UUID = /^[0-9a-f-]{36}$/i;

/**
 * Canal temps réel de la messagerie (Socket.IO, espace /messaging).
 * Chaque connexion authentifiée rejoint la salle de son utilisateur : les événements
 * sont adressés aux personnes, pas aux conversations — aucune salle à maintenir quand
 * un membre rejoint ou quitte un groupe. Avec l'adaptateur Redis, cela fonctionne
 * aussi quand l'API tourne sur plusieurs instances.
 */
@WebSocketGateway({ namespace: '/messaging', cors: { origin: true, credentials: true } })
export class RealtimeGateway implements OnGatewayConnection {
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  private readonly server: Namespace;

  constructor(
    private readonly jwt: JwtService,
    @InjectRepository(ConversationMember) private readonly members: Repository<ConversationMember>,
  ) {}

  async handleConnection(socket: Socket): Promise<void> {
    const token = (socket.handshake.auth as { token?: unknown } | undefined)?.token;
    try {
      if (typeof token !== 'string') throw new Error('jeton absent');
      const payload = await this.jwt.verifyAsync<AccessTokenPayload>(token);
      socket.data.userId = payload.sub;
      await socket.join(userRoom(payload.sub));
    } catch {
      socket.emit('unauthorized');
      socket.disconnect(true);
    }
  }

  /** « Est en train d'écrire » : relayé aux autres membres, jamais stocké. */
  @SubscribeMessage(MessagingEvents.Typing)
  async onTyping(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: { conversationId?: unknown },
  ) {
    const userId = socket.data.userId as string | undefined;
    const conversationId = body?.conversationId;
    if (!userId || typeof conversationId !== 'string' || !UUID.test(conversationId)) return;
    const rows = await this.members.find({ where: { conversationId }, select: { userId: true } });
    if (!rows.some((m) => m.userId === userId)) return;
    const others = rows.map((m) => m.userId).filter((id) => id !== userId);
    this.emitTo(others, MessagingEvents.Typing, { conversationId, userId } satisfies TypingEvent);
  }

  emitTo(userIds: string[], event: string, payload: unknown): void {
    const rooms = [...new Set(userIds)].map(userRoom);
    if (!rooms.length || !this.server) return;
    this.server.to(rooms).emit(event, payload);
  }

  @OnEvent(Events.FriendshipChanged)
  onFriendshipChanged({ userIds }: FriendshipChangedEvent): void {
    this.emitTo(userIds, MessagingEvents.FriendsChanged, {});
  }

  @OnEvent(Events.UserSuspended)
  onUserSuspended({ userId }: UserSuspendedEvent): void {
    this.disconnectUser(userId);
  }

  /** Une session supprimée (déconnexion, compte supprimé) ferme ses sockets. */
  disconnectUser(userId: string): void {
    this.server?.in(userRoom(userId)).disconnectSockets(true);
    this.logger.debug(`Sockets fermés pour ${userId}`);
  }
}
