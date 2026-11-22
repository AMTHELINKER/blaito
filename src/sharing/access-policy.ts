import type { ResourceType, Visibility, WritingStatus } from '../shared';

/**
 * Politique d'accès « qui peut lire quoi » — fonctions pures, testées à part.
 *
 * Règles :
 *  - l'auteur lit tout ;
 *  - un non-auteur ne voit jamais un chapitre en brouillon ;
 *  - public : tout le monde ; amis : amis acceptés de l'auteur ;
 *    lien privé : détenteurs d'un lien valide (non révoqué, non expiré) ;
 *    privé : personne d'autre ;
 *  - une invitation nominative (access grant) ouvre la ressource quel que soit son niveau.
 *    Une invitation sur le livre couvre ses chapitres, sauf ceux marqués « privé ».
 *  - un lien ou une invitation sur un chapitre seul donne accès à la fiche du livre
 *    et à ce chapitre uniquement ;
 *  - un chapitre n'est lisible que si son livre l'est ;
 *  - un contenu masqué par la modération n'est lisible que de son auteur.
 */

export interface ResourceRef {
  resourceType: ResourceType;
  resourceId: string;
}

export interface PolicyBook {
  id: string;
  authorId: string;
  visibility: Visibility;
  hiddenAt?: Date | string | null;
}

export interface PolicyChapter {
  id: string;
  bookId: string;
  visibility: Visibility;
  status: WritingStatus;
  hiddenAt?: Date | string | null;
}

export interface AccessContext {
  viewerId: string | null;
  isFriendOfAuthor: boolean;
  /** Lien de partage valide présenté par le lecteur (déjà vérifié : ni révoqué ni expiré). */
  shareLink: ResourceRef | null;
  /** Invitations du lecteur portant sur ce livre ou ses chapitres. */
  grants: ResourceRef[];
}

interface LevelInput {
  hasGrant: boolean;
  hasToken: boolean;
  isFriend: boolean;
}

export function levelAllows(
  level: Visibility,
  { hasGrant, hasToken, isFriend }: LevelInput,
): boolean {
  if (hasGrant) return true;
  switch (level) {
    case 'public':
      return true;
    case 'link':
      return hasToken;
    case 'friends':
      return isFriend;
    case 'private':
    default:
      return false;
  }
}

const matches = (ref: ResourceRef | null | undefined, type: ResourceType, id: string) =>
  !!ref && ref.resourceType === type && ref.resourceId === id;

export function isOwner(book: PolicyBook, ctx: AccessContext): boolean {
  return !!ctx.viewerId && ctx.viewerId === book.authorId;
}

export function canReadBook(book: PolicyBook, chapterIds: string[], ctx: AccessContext): boolean {
  if (isOwner(book, ctx)) return true;
  if (book.hiddenAt) return false;
  const ofBook = (ref: ResourceRef | null) =>
    matches(ref, 'book', book.id) ||
    (ref?.resourceType === 'chapter' && chapterIds.includes(ref.resourceId));
  return levelAllows(book.visibility, {
    hasGrant: ctx.grants.some(ofBook),
    hasToken: ofBook(ctx.shareLink),
    isFriend: ctx.isFriendOfAuthor,
  });
}

export function canReadChapter(
  book: PolicyBook,
  chapter: PolicyChapter,
  chapterIds: string[],
  ctx: AccessContext,
): boolean {
  if (chapter.bookId !== book.id) return false;
  if (isOwner(book, ctx)) return true;
  if (chapter.status === 'draft' || chapter.hiddenAt) return false;
  if (!canReadBook(book, chapterIds, ctx)) return false;

  const grantOnChapter = ctx.grants.some((g) => matches(g, 'chapter', chapter.id));
  const grantOnBook = ctx.grants.some((g) => matches(g, 'book', book.id));
  const tokenOnChapter = matches(ctx.shareLink, 'chapter', chapter.id);
  const tokenOnBook = matches(ctx.shareLink, 'book', book.id);

  return levelAllows(chapter.visibility, {
    hasGrant: grantOnChapter || (grantOnBook && chapter.visibility !== 'private'),
    hasToken: tokenOnChapter || tokenOnBook,
    isFriend: ctx.isFriendOfAuthor,
  });
}
