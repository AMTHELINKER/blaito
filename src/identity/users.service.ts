import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  DEFAULT_READING_PREFERENCES,
  type MeDto,
  type ProfileDto,
  type UserSettingsDto,
} from '../shared';
import { Profile } from './entities/profile.entity';
import { UserSettings } from './entities/user-settings.entity';
import { User } from './entities/user.entity';
import type { UpdateProfileDto, UpdateSettingsDto } from './dto/me.dto';

export type PublicProfile = Pick<ProfileDto, 'userId' | 'username' | 'displayName' | 'avatarUrl'>;

/**
 * Service exporté par le domaine identité : les autres domaines l'utilisent pour
 * résoudre des profils, sans jamais lire les tables du schéma identity.
 */
@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Profile) private readonly profiles: Repository<Profile>,
    @InjectRepository(UserSettings) private readonly settings: Repository<UserSettings>,
  ) {}

  async getMe(userId: string): Promise<MeDto> {
    const user = await this.users.findOne({
      where: { id: userId },
      relations: { profile: true, settings: true },
    });
    if (!user || !user.profile || user.status !== 'active') throw new NotFoundException();
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      emailVerified: !!user.emailVerifiedAt,
      profile: toProfileDto(user.profile),
      settings: toSettingsDto(user.settings),
    };
  }

  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<ProfileDto> {
    const profile = await this.profiles.findOneByOrFail({ userId });
    if (dto.username && dto.username.toLowerCase() !== profile.username.toLowerCase()) {
      const taken = await this.profiles.exists({ where: { username: dto.username } });
      if (taken) throw new ConflictException('Ce pseudo est déjà pris');
    }
    Object.assign(profile, {
      ...(dto.username !== undefined && { username: dto.username }),
      ...(dto.displayName !== undefined && {
        displayName: dto.displayName.trim() || profile.username,
      }),
      ...(dto.bio !== undefined && { bio: dto.bio.trim() || null }),
      ...(dto.links !== undefined && { links: dto.links }),
    });
    return toProfileDto(await this.profiles.save(profile));
  }

  async setAvatar(
    userId: string,
    avatarUrl: string,
  ): Promise<{ previous: string | null; profile: ProfileDto }> {
    const profile = await this.profiles.findOneByOrFail({ userId });
    const previous = profile.avatarUrl;
    profile.avatarUrl = avatarUrl;
    return { previous, profile: toProfileDto(await this.profiles.save(profile)) };
  }

  async updateSettings(userId: string, dto: UpdateSettingsDto): Promise<UserSettingsDto> {
    const s = await this.settings.findOneByOrFail({ userId });
    if (dto.locale !== undefined) s.locale = dto.locale;
    if (dto.theme !== undefined) s.theme = dto.theme;
    if (dto.notificationsEnabled !== undefined) s.notificationsEnabled = dto.notificationsEnabled;
    if (dto.onboardingCompleted !== undefined) s.onboardingCompleted = dto.onboardingCompleted;
    if (dto.readingPreferences) {
      const clean = Object.fromEntries(
        Object.entries(dto.readingPreferences).filter(([, v]) => v !== undefined),
      );
      s.readingPreferences = { ...s.readingPreferences, ...clean };
    }
    return toSettingsDto(await this.settings.save(s));
  }

  async findProfileByUsername(username: string): Promise<ProfileDto | null> {
    const p = await this.profiles
      .createQueryBuilder('p')
      .innerJoin('p.user', 'u')
      .where('p.username = :username', { username })
      .andWhere("u.status = 'active'")
      .getOne();
    return p ? toProfileDto(p) : null;
  }

  async getPublicProfiles(userIds: string[]): Promise<Map<string, PublicProfile>> {
    const ids = [...new Set(userIds)];
    if (!ids.length) return new Map();
    const rows = await this.profiles.findBy({ userId: In(ids) });
    return new Map(rows.map((p) => [p.userId, toPublicProfile(p)]));
  }

  /** Identifiants des auteurs dont le pseudo ou le nom correspond (recherche du catalogue). */
  async searchUserIds(q: string, limit = 50): Promise<string[]> {
    const rows = await this.profiles
      .createQueryBuilder('p')
      .select('p.user_id', 'id')
      .where('p.username ILIKE :q OR p.display_name ILIKE :q', { q: `%${escapeLike(q)}%` })
      .limit(limit)
      .getRawMany<{ id: string }>();
    return rows.map((r) => r.id);
  }

  async isActive(userId: string): Promise<boolean> {
    return this.users.exists({ where: { id: userId, status: 'active' } });
  }

  async exportData(userId: string) {
    const user = await this.users.findOne({
      where: { id: userId },
      relations: { profile: true, settings: true },
    });
    if (!user) throw new NotFoundException();
    return {
      account: {
        id: user.id,
        email: user.email,
        emailVerifiedAt: user.emailVerifiedAt,
        role: user.role,
        createdAt: user.createdAt,
      },
      profile: user.profile ? toProfileDto(user.profile) : null,
      settings: toSettingsDto(user.settings),
    };
  }
}

export const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export function toProfileDto(p: Profile): ProfileDto {
  return {
    userId: p.userId,
    username: p.username,
    displayName: p.displayName,
    avatarUrl: p.avatarUrl,
    bio: p.bio,
    links: p.links ?? [],
  };
}

export function toPublicProfile(p: Profile): PublicProfile {
  return {
    userId: p.userId,
    username: p.username,
    displayName: p.displayName,
    avatarUrl: p.avatarUrl,
  };
}

export function toSettingsDto(s?: UserSettings | null): UserSettingsDto {
  return {
    locale: s?.locale ?? 'fr',
    theme: s?.theme ?? 'parchment',
    notificationsEnabled: s?.notificationsEnabled ?? true,
    onboardingCompleted: s?.onboardingCompleted ?? false,
    readingPreferences: { ...DEFAULT_READING_PREFERENCES, ...(s?.readingPreferences ?? {}) },
  };
}
