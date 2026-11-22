import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { AuthUser } from '../common/auth/auth-user';
import { decodeCursor, encodeCursor } from '../common/cursor';
import { Events, type UserDeletedEvent, type UserExportEvent } from '../common/events';
import { UsersService } from '../identity/users.service';
import { MessagingService } from '../messaging/messaging.service';
import { AuthorizationService } from '../sharing/authorization.service';
import {
  toPlainText,
  type AdminStatsDto,
  type AdminUserDto,
  type ModerationActionDto,
  type ModerationActionType,
  type Paginated,
  type ReportDecision,
  type ReportDto,
  type ReportStatus,
  type ReportTargetSummary,
  type ReportTargetType,
  type UserRole,
} from '../shared';
import { WritingService } from '../writing/writing.service';
import type { CreateReportDto } from './dto/moderation.dto';
import { ModerationAction } from './entities/moderation-action.entity';
import { Report } from './entities/report.entity';

type ContentType = 'book' | 'chapter' | 'message';
const EXCERPT = 280;
const excerpt = (s: string | null | undefined) => {
  const t = (s ?? '').replace(/\s+/g, ' ').trim();
  return t ? (t.length > EXCERPT ? `${t.slice(0, EXCERPT)}…` : t) : null;
};
const RANK: Record<UserRole, number> = { user: 0, moderator: 1, admin: 2 };

/**
 * Modération : signalements des utilisateurs et décisions de l'équipe.
 *
 * Règles :
 *  - on ne signale que ce que l'on peut voir (livre lisible, message d'une conversation
 *    dont on est membre, profil actif) ; un seul signalement ouvert par personne et par cible ;
 *  - une décision s'applique à la cible : elle clôt tous les signalements ouverts sur celle-ci ;
 *  - « masquer » rend un contenu invisible pour tous sauf son auteur (réversible) ;
 *  - « suspendre » vise l'auteur du contenu : connexion refusée, sessions révoquées ;
 *  - un modérateur n'agit jamais sur un compte de rang égal ou supérieur ; seul un admin
 *    change les rôles ; personne n'agit sur son propre compte ;
 *  - toute décision est inscrite au journal.
 */
@Injectable()
export class ModerationService {
  constructor(
    @InjectRepository(Report) private readonly reports: Repository<Report>,
    @InjectRepository(ModerationAction) private readonly actions: Repository<ModerationAction>,
    private readonly users: UsersService,
    private readonly writing: WritingService,
    private readonly messaging: MessagingService,
    private readonly authz: AuthorizationService,
  ) {}

  // ───────────────────────── Signalements (tous les utilisateurs) ─────────────────────────

  async createReport(reporterId: string, dto: CreateReportDto): Promise<{ message: string }> {
    await this.assertCanReport(reporterId, dto.targetType, dto.targetId);
    const existing = await this.reports.findOneBy({
      reporterId,
      targetType: dto.targetType,
      targetId: dto.targetId,
      status: 'open',
    });
    if (!existing) {
      await this.reports.save(
        this.reports.create({
          reporterId,
          targetType: dto.targetType,
          targetId: dto.targetId,
          reason: dto.reason,
          details: dto.details || null,
        }),
      );
    }
    return { message: 'Merci. Notre équipe va examiner ce signalement.' };
  }

  // ───────────────────────── File des signalements ─────────────────────────

  async listReports(
    status: ReportStatus = 'open',
    cursor?: string,
    limit = 20,
  ): Promise<Paginated<ReportDto>> {
    const after = decodeCursor<[string, string]>(cursor);
    const qb = this.reports
      .createQueryBuilder('r')
      .where('r.status = :status', { status })
      // Les signalements ouverts : les plus anciens d'abord (file d'attente) ; sinon les plus récents.
      .orderBy('r.created_at', status === 'open' ? 'ASC' : 'DESC')
      .addOrderBy('r.id', status === 'open' ? 'ASC' : 'DESC')
      .take(limit + 1);
    if (after) {
      qb.andWhere(`(r.created_at, r.id) ${status === 'open' ? '>' : '<'} (:at, :id)`, {
        at: after[0],
        id: after[1],
      });
    }
    const rows = await qb.getMany();
    const page = rows.slice(0, limit);
    const profiles = await this.users.getPublicProfiles(page.map((r) => r.reporterId));
    const similar = await this.openCountsByTarget(page);
    const items: ReportDto[] = [];
    for (const r of page) {
      items.push({
        id: r.id,
        targetType: r.targetType,
        targetId: r.targetId,
        reason: r.reason,
        details: r.details,
        status: r.status,
        reporter: profiles.get(r.reporterId) ?? null,
        target: await this.summarize(r.targetType, r.targetId),
        similarOpen: similar.get(`${r.targetType}:${r.targetId}`) ?? 0,
        createdAt: r.createdAt.toISOString(),
        resolvedAt: r.resolvedAt?.toISOString() ?? null,
      });
    }
    const last = page[page.length - 1];
    return {
      items,
      nextCursor:
        rows.length > limit && last ? encodeCursor([last.createdAt.toISOString(), last.id]) : null,
    };
  }

  async resolveReport(
    moderator: AuthUser,
    reportId: string,
    decision: ReportDecision,
    note?: string,
  ) {
    const report = await this.reports.findOneBy({ id: reportId });
    if (!report) throw new NotFoundException();
    if (report.status !== 'open') throw new BadRequestException('Ce signalement est déjà traité');
    const { targetType, targetId } = report;

    if (decision === 'hide') {
      if (targetType === 'user')
        throw new BadRequestException('Un profil se suspend, il ne se masque pas');
      await this.hideContent(moderator, targetType, targetId, note, report.id);
    } else if (decision === 'suspend') {
      const summary = await this.summarize(targetType, targetId);
      if (!summary.ownerId)
        throw new BadRequestException('Aucun compte à suspendre pour ce contenu');
      // Un contenu signalé disparaît avec la suspension de son auteur.
      if (targetType !== 'user' && !summary.hidden && !summary.missing) {
        await this.hideContent(moderator, targetType, targetId, note, report.id);
      }
      await this.suspend(moderator, summary.ownerId, note, report.id);
    } else {
      await this.log(moderator.id, 'dismiss_report', targetType, targetId, note, report.id);
    }

    // La décision vaut pour la cible : tous ses signalements ouverts sont clos.
    await this.reports.update(
      { targetType, targetId, status: 'open' },
      {
        status: decision === 'dismiss' ? 'dismissed' : 'resolved',
        resolvedBy: moderator.id,
        resolvedAt: new Date(),
      },
    );
  }

  // ───────────────────────── Contenus ─────────────────────────

  async hideContent(
    moderator: AuthUser,
    type: ContentType,
    id: string,
    reason?: string,
    reportId?: string,
  ) {
    if (!(await this.setHidden(type, id, true))) throw new NotFoundException();
    await this.log(moderator.id, 'hide_content', type, id, reason, reportId);
  }

  async unhideContent(moderator: AuthUser, type: ContentType, id: string, reason?: string) {
    if (!(await this.setHidden(type, id, false))) throw new NotFoundException();
    await this.log(moderator.id, 'unhide_content', type, id, reason);
  }

  // ───────────────────────── Comptes ─────────────────────────

  async listUsers(q?: string, cursor?: string): Promise<Paginated<AdminUserDto>> {
    const { items, nextCursor } = await this.users.listAccounts(q, cursor);
    const counts = await this.writing.countBooksByAuthors(items.map((u) => u.id));
    return {
      items: items.map((u) => ({
        userId: u.id,
        username: u.profile!.username,
        displayName: u.profile!.displayName,
        avatarUrl: u.profile!.avatarUrl,
        email: u.email,
        role: u.role,
        status: u.status,
        emailVerified: !!u.emailVerifiedAt,
        createdAt: u.createdAt.toISOString(),
        bookCount: counts.get(u.id) ?? 0,
      })),
      nextCursor,
    };
  }

  async suspend(moderator: AuthUser, userId: string, reason?: string, reportId?: string) {
    await this.assertCanActOn(moderator, userId);
    await this.users.setStatus(userId, 'suspended');
    await this.log(moderator.id, 'suspend_user', 'user', userId, reason, reportId);
  }

  async reinstate(moderator: AuthUser, userId: string, reason?: string) {
    await this.assertCanActOn(moderator, userId);
    await this.users.setStatus(userId, 'active');
    await this.log(moderator.id, 'reinstate_user', 'user', userId, reason);
  }

  /** Réservé aux admins (contrôlé aussi par le contrôleur). */
  async changeRole(admin: AuthUser, userId: string, role: UserRole) {
    if (admin.role !== 'admin') throw new ForbiddenException();
    if (userId === admin.id)
      throw new BadRequestException('Vous ne pouvez pas changer votre propre rôle');
    const target = await this.users.findAccount(userId);
    if (!target) throw new NotFoundException();
    await this.users.setRole(userId, role);
    await this.log(admin.id, 'change_role', 'user', userId, `${target.role} → ${role}`);
  }

  // ───────────────────────── Tableau de bord ─────────────────────────

  async stats(): Promise<AdminStatsDto> {
    const [users, writing, messages, reports] = await Promise.all([
      this.users.stats(),
      this.writing.stats(),
      this.messaging.stats(),
      this.reports
        .createQueryBuilder('r')
        .select("COUNT(*) FILTER (WHERE r.status = 'open')::int", 'open')
        .addSelect(
          "COUNT(*) FILTER (WHERE r.status <> 'open' AND r.resolved_at > now() - interval '7 days')::int",
          'resolved7d',
        )
        .getRawOne<{ open: number; resolved7d: number }>(),
    ]);
    return { users, ...writing, messages, reports: reports ?? { open: 0, resolved7d: 0 } };
  }

  async listActions(cursor?: string, limit = 30): Promise<Paginated<ModerationActionDto>> {
    const after = decodeCursor<[string, string]>(cursor);
    const qb = this.actions
      .createQueryBuilder('a')
      .orderBy('a.created_at', 'DESC')
      .addOrderBy('a.id', 'DESC')
      .take(limit + 1);
    if (after) qb.where('(a.created_at, a.id) < (:at, :id)', { at: after[0], id: after[1] });
    const rows = await qb.getMany();
    const page = rows.slice(0, limit);
    const profiles = await this.users.getPublicProfiles(page.map((a) => a.moderatorId));
    const items: ModerationActionDto[] = [];
    for (const a of page) {
      items.push({
        id: a.id,
        moderator: profiles.get(a.moderatorId) ?? null,
        action: a.action,
        targetType: a.targetType,
        targetId: a.targetId,
        targetLabel: (await this.summarize(a.targetType, a.targetId)).label,
        reason: a.reason,
        createdAt: a.createdAt.toISOString(),
      });
    }
    const last = page[page.length - 1];
    return {
      items,
      nextCursor:
        rows.length > limit && last ? encodeCursor([last.createdAt.toISOString(), last.id]) : null,
    };
  }

  // ───────────────────────── Événements ─────────────────────────

  @OnEvent(Events.UserDeleted, { async: true, promisify: true })
  async onUserDeleted({ userId }: UserDeletedEvent): Promise<void> {
    // Les signalements faits par la personne disparaissent ; ceux qui la visent sont clos.
    await this.reports.delete({ reporterId: userId });
    await this.reports.update(
      { targetType: 'user', targetId: userId, status: 'open' },
      { status: 'dismissed', resolvedAt: new Date() },
    );
  }

  @OnEvent(Events.UserExport, { async: true, promisify: true })
  async onUserExport({ userId }: UserExportEvent) {
    const made = await this.reports.find({ where: { reporterId: userId } });
    return {
      moderation: {
        reportsMade: made.map((r) => ({
          targetType: r.targetType,
          targetId: r.targetId,
          reason: r.reason,
          details: r.details,
          status: r.status,
          createdAt: r.createdAt,
        })),
      },
    };
  }

  // ───────────────────────── interne ─────────────────────────

  private async assertCanReport(
    reporterId: string,
    type: ReportTargetType,
    id: string,
  ): Promise<void> {
    switch (type) {
      case 'book':
      case 'chapter': {
        const ok = await this.authz.canRead(reporterId, { resourceType: type, resourceId: id });
        if (!ok) throw new NotFoundException();
        const summary = await this.summarize(type, id);
        if (summary.ownerId === reporterId)
          throw new BadRequestException('Vous ne pouvez pas signaler votre propre contenu');
        return;
      }
      case 'user': {
        if (id === reporterId)
          throw new BadRequestException('Vous ne pouvez pas vous signaler vous-même');
        if (!(await this.users.isActive(id))) throw new NotFoundException();
        return;
      }
      case 'message': {
        const m = await this.messaging.findMessage(id);
        if (!m || m.deletedAt || !(await this.messaging.isMember(reporterId, m.conversationId))) {
          throw new NotFoundException();
        }
        if (m.senderId === reporterId)
          throw new BadRequestException('Vous ne pouvez pas signaler votre propre message');
        return;
      }
    }
  }

  private async assertCanActOn(moderator: AuthUser, userId: string): Promise<void> {
    if (userId === moderator.id)
      throw new BadRequestException('Action impossible sur votre propre compte');
    const target = await this.users.findAccount(userId);
    if (!target) throw new NotFoundException();
    if (RANK[target.role] >= RANK[moderator.role]) {
      throw new ForbiddenException('Ce compte a un rôle égal ou supérieur au vôtre');
    }
  }

  private async setHidden(type: ContentType, id: string, hidden: boolean): Promise<boolean> {
    if (type === 'book') return this.writing.setBookHidden(id, hidden);
    if (type === 'chapter') return this.writing.setChapterHidden(id, hidden);
    return hidden ? this.messaging.moderatorDelete(id) : this.messaging.restoreMessage(id);
  }

  private async log(
    moderatorId: string,
    action: ModerationActionType,
    targetType: ReportTargetType,
    targetId: string,
    reason?: string | null,
    reportId?: string | null,
  ): Promise<void> {
    await this.actions.save(
      this.actions.create({
        moderatorId,
        action,
        targetType,
        targetId,
        reason: reason || null,
        reportId: reportId ?? null,
      }),
    );
  }

  private async openCountsByTarget(reports: Report[]): Promise<Map<string, number>> {
    if (!reports.length) return new Map();
    const rows = await this.reports
      .createQueryBuilder('r')
      .select('r.target_type', 'type')
      .addSelect('r.target_id', 'id')
      .addSelect('COUNT(*)::int', 'count')
      .where("r.status = 'open'")
      .andWhere('r.target_id IN (:...ids)', { ids: [...new Set(reports.map((r) => r.targetId))] })
      .groupBy('r.target_type')
      .addGroupBy('r.target_id')
      .getRawMany<{ type: string; id: string; count: number }>();
    return new Map(rows.map((r) => [`${r.type}:${r.id}`, r.count]));
  }

  /** Décrit la cible d'un signalement à partir des services des autres domaines. */
  private async summarize(type: ReportTargetType, id: string): Promise<ReportTargetSummary> {
    const missing: ReportTargetSummary = {
      label: 'Contenu supprimé',
      excerpt: null,
      href: null,
      ownerId: null,
      ownerName: null,
      hidden: false,
      missing: true,
    };
    const ownerName = async (ownerId: string | null) =>
      ownerId
        ? ((await this.users.getPublicProfiles([ownerId])).get(ownerId)?.displayName ?? null)
        : null;

    if (type === 'book') {
      const meta = await this.writing.findBookMeta(id);
      if (!meta) return missing;
      return {
        label: `Livre « ${meta.book.title} »`,
        excerpt: excerpt(meta.book.summary),
        href: `/lire/${id}`,
        ownerId: meta.authorId,
        ownerName: await ownerName(meta.authorId),
        hidden: !!meta.book.hiddenAt,
        missing: false,
      };
    }
    if (type === 'chapter') {
      const meta = await this.writing.findChapterMeta(id);
      const book = meta && (await this.writing.findBookMeta(meta.bookId));
      if (!meta || !book) return missing;
      return {
        label: `Chapitre « ${meta.chapter.title} » de « ${book.book.title} »`,
        excerpt: excerpt(toPlainText(await this.writing.getChapterText(id))),
        href: `/lire/${book.id}/${id}`,
        ownerId: book.authorId,
        ownerName: await ownerName(book.authorId),
        hidden: !!meta.chapter.hiddenAt,
        missing: false,
      };
    }
    if (type === 'user') {
      const account = await this.users.findAccount(id);
      if (!account?.profile) return missing;
      return {
        label: `Profil ${account.profile.displayName} (@${account.profile.username})`,
        excerpt: excerpt(account.profile.bio),
        href: account.status === 'active' ? `/u/${account.profile.username}` : null,
        ownerId: id,
        ownerName: account.profile.displayName,
        hidden: account.status === 'suspended',
        missing: false,
      };
    }
    const message = await this.messaging.findMessage(id);
    if (!message) return missing;
    return {
      label: 'Message privé',
      excerpt: excerpt(message.body),
      href: null,
      ownerId: message.senderId,
      ownerName: await ownerName(message.senderId),
      hidden: !!message.deletedAt,
      missing: false,
    };
  }
}
