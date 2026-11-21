import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { FriendDto } from '../shared';
import { Events, type UserDeletedEvent, type UserExportEvent } from '../common/events';
import { UsersService } from '../identity/users.service';
import { Friendship } from './entities/friendship.entity';

@Injectable()
export class SocialService {
  constructor(
    @InjectRepository(Friendship) private readonly friendships: Repository<Friendship>,
    private readonly users: UsersService,
  ) {}

  async areFriends(a: string, b: string): Promise<boolean> {
    if (a === b) return false;
    return this.friendships.exists({
      where: [
        { requesterId: a, addresseeId: b, status: 'accepted' },
        { requesterId: b, addresseeId: a, status: 'accepted' },
      ],
    });
  }

  async list(userId: string): Promise<FriendDto[]> {
    const rows = await this.friendships.find({
      where: [{ requesterId: userId }, { addresseeId: userId }],
      order: { updatedAt: 'DESC' },
    });
    const visible = rows.filter((f) => f.status !== 'blocked');
    const otherIds = visible.map((f) => (f.requesterId === userId ? f.addresseeId : f.requesterId));
    const profiles = await this.users.getPublicProfiles(otherIds);
    return visible.flatMap((f) => {
      const otherId = f.requesterId === userId ? f.addresseeId : f.requesterId;
      const p = profiles.get(otherId);
      if (!p) return [];
      return [
        {
          ...p,
          status: f.status,
          direction:
            f.status === 'accepted' ? 'mutual' : f.requesterId === userId ? 'outgoing' : 'incoming',
        } satisfies FriendDto,
      ];
    });
  }

  /** Envoie une demande, ou accepte la demande entrante existante. */
  async request(userId: string, username: string): Promise<FriendDto> {
    const target = await this.users.findProfileByUsername(username);
    if (!target) throw new NotFoundException('Utilisateur introuvable');
    if (target.userId === userId)
      throw new BadRequestException('Vous ne pouvez pas vous ajouter vous-même');

    const incoming = await this.friendships.findOneBy({
      requesterId: target.userId,
      addresseeId: userId,
    });
    const outgoing = await this.friendships.findOneBy({
      requesterId: userId,
      addresseeId: target.userId,
    });
    let status: FriendDto['status'] = 'pending';
    let direction: FriendDto['direction'] = 'outgoing';
    if (incoming?.status === 'blocked') throw new NotFoundException('Utilisateur introuvable');
    if (incoming) {
      incoming.status = 'accepted';
      await this.friendships.save(incoming);
      status = 'accepted';
      direction = 'mutual';
    } else if (outgoing) {
      status = outgoing.status;
      direction = outgoing.status === 'accepted' ? 'mutual' : 'outgoing';
    } else {
      await this.friendships.save(
        this.friendships.create({ requesterId: userId, addresseeId: target.userId }),
      );
    }
    return {
      userId: target.userId,
      username: target.username,
      displayName: target.displayName,
      avatarUrl: target.avatarUrl,
      status,
      direction,
    };
  }

  async remove(userId: string, otherId: string): Promise<void> {
    await this.friendships.delete({ requesterId: userId, addresseeId: otherId });
    await this.friendships.delete({ requesterId: otherId, addresseeId: userId });
  }

  @OnEvent(Events.UserDeleted, { async: true, promisify: true })
  async onUserDeleted({ userId }: UserDeletedEvent): Promise<void> {
    await this.friendships.delete({ requesterId: userId });
    await this.friendships.delete({ addresseeId: userId });
  }

  @OnEvent(Events.UserExport, { async: true, promisify: true })
  async onUserExport({ userId }: UserExportEvent) {
    return { social: { friends: await this.list(userId) } };
  }
}
