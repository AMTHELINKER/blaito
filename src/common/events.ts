/**
 * Événements inter-domaines. Les domaines ne lisent jamais les tables des autres :
 * ils réagissent à ces événements ou appellent les services exportés.
 */
export const Events = {
  /** payload: UserDeletedEvent — chaque domaine supprime les données de l'utilisateur. */
  UserDeleted: 'user.deleted',
  /** payload: { userId } — chaque domaine renvoie `{ [domaine]: données }` (export RGPD). */
  UserExport: 'user.export',
  /** payload: ResourceDeletedEvent — le partage nettoie liens et invitations. */
  BookDeleted: 'writing.book.deleted',
} as const;

export interface UserDeletedEvent {
  userId: string;
}

export interface UserExportEvent {
  userId: string;
}

export interface BookDeletedEvent {
  bookId: string;
  chapterIds: string[];
}
