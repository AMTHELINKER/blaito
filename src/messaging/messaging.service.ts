import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { Brackets, DataSource, In, LessThan, Repository } from 'typeorm';
import { decodeCursor, encodeCursor } from '../common/cursor';
import { Events, type UserDeletedEvent, type UserExportEvent } from '../common/events';
import { UsersService } from '../identity/users.service';
import {
  GROUP_MAX_MEMBERS,
  MessagingEvents,
  type ConversationDto,
  type ConversationReadEvent,
  type ConversationRemovedEvent,
  type MemberRole,
  type MessageDeletedEvent,
  type MessageDto,
  type MessageNewEvent,
  type Paginated,
} from '../shared';
import { SocialService } from '../social/social.service';
import { ConversationMember } from './entities/conversation-member.entity';
import { Conversation } from './entities/conversation.entity';
import { Message } from './entities/message.entity';
import { RealtimeGateway } from './realtime.gateway';

const directKey = (a: string, b: string) => [a, b].sort().join(':');
const canManage = (role: MemberRole) => role === 'owner' || role === 'admin';

/**
 * Messagerie : conversations privées (entre amis) et groupes.
 *
 * Règles :
 *  - on n'écrit en privé qu'à un ami accepté ; si l'amitié est retirée,
 *    l'historique reste lisible mais l'envoi est bloqué ;
 *  - un groupe se compose d'amis de la personne qui ajoute ; 50 membres maximum ;
 *  - propriétaire et administrateurs renomment, ajoutent et retirent ;
 *    le propriétaire ne peut pas être retiré ; s'il part, le plus ancien membre
 *    devient propriétaire ; un groupe vide est supprimé ;
 *  - tout ce qui n'appartient pas à l'utilisateur répond 404.
 */
@Injectable()
export class MessagingService {
  constructor(
    @InjectRepository(Conversation) private readonly conversations: Repository<Conversation>,
    @InjectRepository(ConversationMember) private readonly members: Repository<ConversationMember>,
    @InjectRepository(Message) private readonly messages: Repository<Message>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly users: UsersService,
    private readonly social: SocialService,
    private readonly realtime: RealtimeGateway,
  ) {}

  // ───────────────────────── Conversations ─────────────────────────

  /** Conversations de l'utilisateur, la plus récente d'abord. Curseur : (date d'activité, id). */
  async list(userId: string, cursor?: string, limit = 30): Promise<Paginated<ConversationDto>> {
    const after = decodeCursor<[string, string]>(cursor);
    const qb = this.conversations
      .createQueryBuilder('c')
      .innerJoin(ConversationMember, 'm', 'm.conversation_id = c.id AND m.user_id = :userId', {
        userId,
      })
      .addSelect('COALESCE(c.last_message_at, c.created_at)', 'activity')
      .orderBy('activity', 'DESC')
      .addOrderBy('c.id', 'DESC')
      .limit(limit + 1);
    if (after) {
      qb.andWhere('(COALESCE(c.last_message_at, c.created_at), c.id) < (:at, :id)', {
        at: after[0],
        id: after[1],
      });
    }
    const rows = await qb.getMany();
    const page = rows.slice(0, limit);
    const items = await this.toDtos(userId, page);
    const last = page[page.length - 1];
    return {
      items,
      nextCursor:
        rows.length > limit && last
          ? encodeCursor([(last.lastMessageAt ?? last.createdAt).toISOString(), last.id])
          : null,
    };
  }

  async get(userId: string, conversationId: string): Promise<ConversationDto> {
    const { conversation } = await this.membership(userId, conversationId);
    const [dto] = await this.toDtos(userId, [conversation]);
    return dto;
  }

  /** Ouvre (ou retrouve) la conversation privée avec un ami. */
  async openDirect(userId: string, otherId: string): Promise<ConversationDto> {
    if (otherId === userId)
      throw new BadRequestException('Vous ne pouvez pas vous écrire à vous-même');
    if (!(await this.users.isActive(otherId)))
      throw new NotFoundException('Utilisateur introuvable');
    if (!(await this.social.areFriends(userId, otherId))) {
      throw new ForbiddenException('Vous ne pouvez écrire qu’à vos amis.');
    }
    const key = directKey(userId, otherId);
    let conversation = await this.conversations.findOneBy({ directKey: key });
    if (!conversation) {
      conversation = await this.dataSource.transaction(async (em) => {
        const c = await em.save(
          em.create(Conversation, {
            type: 'direct',
            directKey: key,
            createdBy: userId,
            title: null,
          }),
        );
        await em.save([
          em.create(ConversationMember, { conversationId: c.id, userId, role: 'member' }),
          em.create(ConversationMember, { conversationId: c.id, userId: otherId, role: 'member' }),
        ]);
        return c;
      });
    }
    return this.get(userId, conversation.id);
  }

  async createGroup(userId: string, title: string, memberIds: string[]): Promise<ConversationDto> {
    const ids = [...new Set(memberIds)].filter((id) => id !== userId);
    if (!ids.length) throw new BadRequestException('Ajoutez au moins un ami');
    if (ids.length + 1 > GROUP_MAX_MEMBERS) {
      throw new BadRequestException(`Un groupe compte au plus ${GROUP_MAX_MEMBERS} membres`);
    }
    await this.assertFriends(userId, ids);
    const conversation = await this.dataSource.transaction(async (em) => {
      const c = await em.save(em.create(Conversation, { type: 'group', title, createdBy: userId }));
      await em.save([
        em.create(ConversationMember, { conversationId: c.id, userId, role: 'owner' }),
        ...ids.map((id) =>
          em.create(ConversationMember, { conversationId: c.id, userId: id, role: 'member' }),
        ),
      ]);
      return c;
    });
    await this.broadcastUpdate(conversation.id);
    return this.get(userId, conversation.id);
  }

  async rename(userId: string, conversationId: string, title: string): Promise<ConversationDto> {
    const { conversation, member } = await this.membership(userId, conversationId);
    this.assertGroupManager(conversation, member);
    conversation.title = title;
    await this.conversations.save(conversation);
    await this.broadcastUpdate(conversationId);
    return this.get(userId, conversationId);
  }

  async addMembers(
    userId: string,
    conversationId: string,
    userIds: string[],
  ): Promise<ConversationDto> {
    const { conversation, member } = await this.membership(userId, conversationId);
    this.assertGroupManager(conversation, member);
    const existing = new Set(
      (await this.members.find({ where: { conversationId }, select: { userId: true } })).map(
        (m) => m.userId,
      ),
    );
    const toAdd = [...new Set(userIds)].filter((id) => !existing.has(id));
    if (!toAdd.length) return this.get(userId, conversationId);
    if (existing.size + toAdd.length > GROUP_MAX_MEMBERS) {
      throw new BadRequestException(`Un groupe compte au plus ${GROUP_MAX_MEMBERS} membres`);
    }
    await this.assertFriends(userId, toAdd);
    await this.members.insert(
      toAdd.map((id) => ({ conversationId, userId: id, role: 'member' as const })),
    );
    await this.broadcastUpdate(conversationId);
    return this.get(userId, conversationId);
  }

  /** Retirer un membre, ou se retirer soi-même (quitter le groupe). */
  async removeMember(userId: string, conversationId: string, targetId: string): Promise<void> {
    const { conversation, member } = await this.membership(userId, conversationId);
    if (conversation.type !== 'group') throw new BadRequestException('Action réservée aux groupes');
    if (targetId !== userId) {
      if (!canManage(member.role))
        throw new ForbiddenException('Seuls les administrateurs retirent des membres');
      const target = await this.members.findOneBy({ conversationId, userId: targetId });
      if (!target) throw new NotFoundException();
      if (target.role === 'owner')
        throw new ForbiddenException('Le propriétaire ne peut pas être retiré');
    }
    await this.dataSource.transaction(async (em) => {
      await em.delete(ConversationMember, { conversationId, userId: targetId });
      const remaining = await em.find(ConversationMember, {
        where: { conversationId },
        order: { createdAt: 'ASC' },
      });
      if (!remaining.length) {
        await em.delete(Conversation, { id: conversationId });
      } else if (!remaining.some((m) => m.role === 'owner')) {
        // Le propriétaire est parti : le membre le plus ancien prend le relais.
        await em.update(
          ConversationMember,
          { conversationId, userId: remaining[0].userId },
          { role: 'owner' },
        );
      }
    });
    this.realtime.emitTo([targetId], MessagingEvents.ConversationRemoved, {
      conversationId,
    } satisfies ConversationRemovedEvent);
    await this.broadcastUpdate(conversationId);
  }

  // ───────────────────────── Messages ─────────────────────────

  /** Messages du plus récent au plus ancien ; `before` = plus ancien message déjà chargé. */
  async listMessages(
    userId: string,
    conversationId: string,
    before?: string,
    limit = 40,
  ): Promise<Paginated<MessageDto>> {
    await this.membership(userId, conversationId);
    const rows = await this.messages.find({
      where: { conversationId, ...(before && { id: LessThan(before) }) },
      withDeleted: true,
      order: { id: 'DESC' },
      take: limit + 1,
    });
    const page = rows.slice(0, limit);
    return {
      items: page.map(toMessageDto),
      nextCursor: rows.length > limit ? page[page.length - 1].id : null,
    };
  }

  async send(
    userId: string,
    conversationId: string,
    rawBody: string,
    clientId?: string,
  ): Promise<MessageDto> {
    const body = rawBody.replace(/\r\n?/g, '\n').trim();
    if (!body) throw new BadRequestException('Le message est vide');
    const { conversation } = await this.membership(userId, conversationId);
    if (conversation.type === 'direct' && !(await this.canSendDirect(userId, conversation))) {
      throw new ForbiddenException(
        'Vous n’êtes plus amis : cette conversation est en lecture seule.',
      );
    }
    const now = new Date();
    const message = await this.dataSource.transaction(async (em) => {
      const m = await em.save(
        em.create(Message, { conversationId, senderId: userId, body, clientId: clientId ?? null }),
      );
      await em.update(Conversation, { id: conversationId }, { lastMessageAt: m.createdAt ?? now });
      await em.update(
        ConversationMember,
        { conversationId, userId },
        { lastReadAt: m.createdAt ?? now },
      );
      return m;
    });
    const dto = toMessageDto(message);
    const memberIds = await this.memberIds(conversationId);
    this.realtime.emitTo(memberIds, MessagingEvents.MessageNew, {
      conversationId,
      message: dto,
    } satisfies MessageNewEvent);
    return dto;
  }

  async deleteMessage(userId: string, conversationId: string, messageId: string): Promise<void> {
    await this.membership(userId, conversationId);
    const message = await this.messages.findOneBy({ id: messageId, conversationId });
    if (!message || message.senderId !== userId) throw new NotFoundException();
    await this.messages.softDelete({ id: messageId });
    this.realtime.emitTo(await this.memberIds(conversationId), MessagingEvents.MessageDeleted, {
      conversationId,
      messageId,
    } satisfies MessageDeletedEvent);
  }

  async markRead(userId: string, conversationId: string): Promise<void> {
    await this.membership(userId, conversationId);
    const readAt = new Date();
    await this.members.update({ conversationId, userId }, { lastReadAt: readAt });
    // Synchronise les autres appareils de l'utilisateur (et permettra les accusés de lecture).
    this.realtime.emitTo(await this.memberIds(conversationId), MessagingEvents.ConversationRead, {
      conversationId,
      userId,
      readAt: readAt.toISOString(),
    } satisfies ConversationReadEvent);
  }

  /** Nombre total de messages non lus (pastille de navigation). */
  async unreadTotal(userId: string): Promise<{ count: number }> {
    const row = await this.messages
      .createQueryBuilder('msg')
      .innerJoin(
        ConversationMember,
        'm',
        'm.conversation_id = msg.conversation_id AND m.user_id = :userId',
        {
          userId,
        },
      )
      .where('msg.sender_id <> :userId', { userId })
      .andWhere(
        new Brackets((w) =>
          w.where('m.last_read_at IS NULL').orWhere('msg.created_at > m.last_read_at'),
        ),
      )
      .select('COUNT(*)::int', 'count')
      .getRawOne<{ count: number }>();
    return { count: row?.count ?? 0 };
  }

  // ───────────────────────── Modération (appelée par le domaine moderation) ─────────────────────────

  async findMessage(messageId: string): Promise<Message | null> {
    return this.messages.findOne({ where: { id: messageId }, withDeleted: true });
  }

  async isMember(userId: string, conversationId: string): Promise<boolean> {
    return this.members.existsBy({ userId, conversationId });
  }

  /** Masque un message signalé : il apparaît comme supprimé pour tous les membres. */
  async moderatorDelete(messageId: string): Promise<boolean> {
    const message = await this.messages.findOneBy({ id: messageId });
    if (!message) return false;
    await this.messages.softDelete({ id: messageId });
    this.realtime.emitTo(
      await this.memberIds(message.conversationId),
      MessagingEvents.MessageDeleted,
      {
        conversationId: message.conversationId,
        messageId,
      } satisfies MessageDeletedEvent,
    );
    return true;
  }

  async restoreMessage(messageId: string): Promise<boolean> {
    const res = await this.messages.restore({ id: messageId });
    return !!res.affected;
  }

  async stats() {
    const row = await this.messages
      .createQueryBuilder('m')
      .select('COUNT(*)::int', 'total')
      .addSelect("COUNT(*) FILTER (WHERE m.created_at > now() - interval '7 days')::int", 'last7d')
      .getRawOne<{ total: number; last7d: number }>();
    return row ?? { total: 0, last7d: 0 };
  }

  // ───────────────────────── Événements ─────────────────────────

  @OnEvent(Events.UserDeleted, { async: true, promisify: true })
  async onUserDeleted({ userId }: UserDeletedEvent): Promise<void> {
    const memberships = await this.members.find({ where: { userId } });
    const ids = memberships.map((m) => m.conversationId);
    await this.messages.delete({ senderId: userId });
    if (ids.length) {
      // Les conversations privées de la personne disparaissent avec elle.
      await this.conversations.delete({ id: In(ids), type: 'direct' });
    }
    for (const m of memberships) {
      const stillExists = await this.conversations.existsBy({ id: m.conversationId });
      if (stillExists)
        await this.removeMember(userId, m.conversationId, userId).catch(() => undefined);
    }
    this.realtime.disconnectUser(userId);
  }

  @OnEvent(Events.UserExport, { async: true, promisify: true })
  async onUserExport({ userId }: UserExportEvent) {
    const sent = await this.messages.find({ where: { senderId: userId }, order: { id: 'ASC' } });
    return {
      messaging: {
        messagesSent: sent.map((m) => ({
          conversationId: m.conversationId,
          body: m.body,
          createdAt: m.createdAt,
        })),
      },
    };
  }

  // ───────────────────────── interne ─────────────────────────

  private async membership(userId: string, conversationId: string) {
    const member = await this.members.findOne({
      where: { conversationId, userId },
      relations: { conversation: true },
    });
    if (!member?.conversation) throw new NotFoundException();
    return { member, conversation: member.conversation };
  }

  private assertGroupManager(conversation: Conversation, member: ConversationMember): void {
    if (conversation.type !== 'group') throw new BadRequestException('Action réservée aux groupes');
    if (!canManage(member.role))
      throw new ForbiddenException('Action réservée aux administrateurs du groupe');
  }

  private async assertFriends(userId: string, ids: string[]): Promise<void> {
    const friends = new Set(await this.social.friendIds(userId));
    if (ids.some((id) => !friends.has(id))) {
      throw new BadRequestException('Vous ne pouvez ajouter que vos amis');
    }
  }

  private async canSendDirect(userId: string, conversation: Conversation): Promise<boolean> {
    const otherId = conversation.directKey?.split(':').find((id) => id !== userId);
    return !!otherId && (await this.social.areFriends(userId, otherId));
  }

  private async memberIds(conversationId: string): Promise<string[]> {
    const rows = await this.members.find({ where: { conversationId }, select: { userId: true } });
    return rows.map((m) => m.userId);
  }

  /** Prévient chaque membre qu'il doit rafraîchir la conversation (titre, membres). */
  private async broadcastUpdate(conversationId: string): Promise<void> {
    const ids = await this.memberIds(conversationId);
    this.realtime.emitTo(ids, MessagingEvents.ConversationUpdated, { conversationId });
  }

  /** Construit les DTO d'une page de conversations en un nombre fixe de requêtes. */
  private async toDtos(userId: string, conversations: Conversation[]): Promise<ConversationDto[]> {
    if (!conversations.length) return [];
    const ids = conversations.map((c) => c.id);

    const members = await this.members.find({
      where: { conversationId: In(ids) },
      order: { createdAt: 'ASC' },
    });
    const profiles = await this.users.getPublicProfiles(members.map((m) => m.userId));

    const lastMessages: Message[] = await this.messages
      .createQueryBuilder('msg')
      .withDeleted()
      .distinctOn(['msg.conversation_id'])
      .where('msg.conversation_id IN (:...ids)', { ids })
      .orderBy('msg.conversation_id')
      .addOrderBy('msg.id', 'DESC')
      .getMany();

    const unread = await this.messages
      .createQueryBuilder('msg')
      .innerJoin(
        ConversationMember,
        'm',
        'm.conversation_id = msg.conversation_id AND m.user_id = :userId',
        {
          userId,
        },
      )
      .where('msg.conversation_id IN (:...ids)', { ids })
      .andWhere('msg.sender_id <> :userId', { userId })
      .andWhere(
        new Brackets((w) =>
          w.where('m.last_read_at IS NULL').orWhere('msg.created_at > m.last_read_at'),
        ),
      )
      .select('msg.conversation_id', 'conversationId')
      .addSelect('COUNT(*)::int', 'count')
      .groupBy('msg.conversation_id')
      .getRawMany<{ conversationId: string; count: number }>();

    const friends = new Set(await this.social.friendIds(userId));
    const lastBy = new Map(lastMessages.map((m) => [m.conversationId, m]));
    const unreadBy = new Map(unread.map((u) => [u.conversationId, u.count]));

    return conversations.map((c) => {
      const own = members.filter((m) => m.conversationId === c.id);
      const mine = own.find((m) => m.userId === userId);
      const last = lastBy.get(c.id);
      const otherId =
        c.type === 'direct' ? own.find((m) => m.userId !== userId)?.userId : undefined;
      return {
        id: c.id,
        type: c.type,
        title: c.title,
        members: own.flatMap((m) => {
          const p = profiles.get(m.userId);
          return p ? [{ ...p, role: m.role, joinedAt: m.createdAt.toISOString() }] : [];
        }),
        lastMessage: last ? toMessageDto(last) : null,
        lastMessageAt: c.lastMessageAt?.toISOString() ?? null,
        unreadCount: unreadBy.get(c.id) ?? 0,
        myRole: mine?.role ?? 'member',
        canSend: c.type === 'group' || (!!otherId && friends.has(otherId)),
        createdAt: c.createdAt.toISOString(),
      };
    });
  }
}

export function toMessageDto(m: Message): MessageDto {
  const deleted = !!m.deletedAt;
  return {
    id: m.id,
    conversationId: m.conversationId,
    senderId: m.senderId,
    body: deleted ? '' : m.body,
    createdAt: m.createdAt.toISOString(),
    deletedAt: m.deletedAt?.toISOString() ?? null,
    clientId: m.clientId,
  };
}
