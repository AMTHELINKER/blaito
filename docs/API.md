# API Laito v1

Base : `/api/v1` — documentation interactive : `/api/docs` (Swagger).
Types de réponse : voir `src/shared/index.ts`.

## Authentification

- Jeton d'accès JWT (15 min) dans l'en-tête `Authorization: Bearer <token>`.
- Refresh token (30 j) dans le cookie httpOnly `laito_rt` (path `/api/v1/auth`), avec rotation.
- Toutes les requêtes du front utilisent `credentials: 'include'`.

| Méthode | Route                       | Corps                 | Réponse                                                               |
| ------- | --------------------------- | --------------------- | --------------------------------------------------------------------- |
| POST    | `/auth/register`            | `RegisterRequest`     | `{ message }` — e-mail de vérification envoyé                         |
| POST    | `/auth/verify-email`        | `{ token }`           | `AuthResponse` + cookie                                               |
| POST    | `/auth/resend-verification` | `{ email }`           | `{ message }`                                                         |
| POST    | `/auth/login`               | `LoginRequest`        | `AuthResponse` + cookie ; **403** `EMAIL_NOT_VERIFIED` si non vérifié |
| POST    | `/auth/refresh`             | — (cookie)            | `AuthResponse`                                                        |
| POST    | `/auth/logout`              | —                     | 204                                                                   |
| POST    | `/auth/forgot-password`     | `{ email }`           | `{ message }` (toujours 200)                                          |
| POST    | `/auth/reset-password`      | `{ token, password }` | `{ message }`                                                         |

## Compte

| Méthode | Route                 | Corps                                                      | Réponse                                                      |
| ------- | --------------------- | ---------------------------------------------------------- | ------------------------------------------------------------ |
| GET     | `/me`                 | —                                                          | `MeDto`                                                      |
| PATCH   | `/me/profile`         | `{ username?, displayName?, bio?, links? }`                | `ProfileDto`                                                 |
| POST    | `/me/avatar`          | multipart `file`                                           | `ProfileDto`                                                 |
| PATCH   | `/me/settings`        | `Partial<UserSettingsDto>` (readingPreferences fusionnées) | `UserSettingsDto`                                            |
| GET     | `/me/export`          | —                                                          | export JSON complet (RGPD)                                   |
| DELETE  | `/me`                 | `{ password }`                                             | 204                                                          |
| GET     | `/profiles/:username` | —                                                          | `{ profile: ProfileDto, books: BookDto[] }` (livres publics) |

## Écriture (propriétaire uniquement, sinon 404)

| Méthode | Route                       | Corps                                   | Réponse                               |
| ------- | --------------------------- | --------------------------------------- | ------------------------------------- |
| GET     | `/books/mine`               | —                                       | `BookDto[]`                           |
| POST    | `/books`                    | `CreateBookRequest`                     | `BookDto` (privé, brouillon)          |
| GET     | `/books/:id`                | —                                       | `BookDto`                             |
| PATCH   | `/books/:id`                | `UpdateBookRequest`                     | `BookDto`                             |
| DELETE  | `/books/:id`                | —                                       | 204 (suppression douce)               |
| POST    | `/books/:id/restore`        | —                                       | `BookDto` (annulation de suppression) |
| POST    | `/books/:id/cover`          | multipart `file` (≤ 5 Mo, JPG/PNG/WebP) | `BookDto`                             |
| GET     | `/books/:id/chapters`       | —                                       | `ChapterDto[]` (sans contenu)         |
| POST    | `/books/:id/chapters`       | `CreateChapterRequest`                  | `ChapterDto`                          |
| PUT     | `/books/:id/chapters/order` | `ReorderChaptersRequest`                | `ChapterDto[]` — une seule requête    |
| PATCH   | `/chapters/:id`             | `UpdateChapterRequest`                  | `ChapterDto`                          |
| DELETE  | `/chapters/:id`             | —                                       | 204                                   |
| GET     | `/chapters/:id/content`     | —                                       | `ChapterContentDto`                   |
| PUT     | `/chapters/:id/content`     | `SaveContentRequest`                    | `ChapterContentDto`                   |

## Lecture (soumise au service d'autorisation ; non autorisé → 404)

Paramètre optionnel `?share=<token>` pour lire via un lien privé.

| Méthode | Route                | Réponse                                                          |
| ------- | -------------------- | ---------------------------------------------------------------- |
| GET     | `/read/books/:id`    | `ReadableBookDto`                                                |
| GET     | `/read/chapters/:id` | `ReadableChapterDto`                                             |
| PUT     | `/read/progress`     | corps `{ bookId, chapterId, position }` → `ReadingProgressDto`   |
| GET     | `/read/progress`     | `(ReadingProgressDto & { book: BookDto })[]` — lectures en cours |

## Partage

| Méthode | Route                                     | Corps                      | Réponse                                         |
| ------- | ----------------------------------------- | -------------------------- | ----------------------------------------------- |
| GET     | `/share/links?resourceType=&resourceId=`  | —                          | `ShareLinkDto[]`                                |
| POST    | `/share/links`                            | `CreateShareLinkRequest`   | `ShareLinkDto`                                  |
| DELETE  | `/share/links/:id`                        | —                          | 204 (révocation)                                |
| GET     | `/share/resolve/:token`                   | —                          | `{ resourceType, resourceId, bookId }` (public) |
| GET     | `/share/grants?resourceType=&resourceId=` | —                          | `AccessGrantDto[]`                              |
| POST    | `/share/grants`                           | `CreateAccessGrantRequest` | `AccessGrantDto`                                |
| DELETE  | `/share/grants/:id`                       | —                          | 204                                             |
| GET     | `/share/with-me`                          | —                          | `BookDto[]`                                     |

## Personnes

| Méthode | Route                                  | Réponse                                       |
| ------- | -------------------------------------- | --------------------------------------------- |
| GET     | `/users/search?q=` (2 caractères min.) | `PublicProfileDto[]` (10 max., sans soi-même) |

## Amis (gérés depuis l'écran Messages)

| Méthode | Route                | Réponse                                                   |
| ------- | -------------------- | --------------------------------------------------------- |
| GET     | `/friends`           | `FriendDto[]`                                             |
| POST    | `/friends/:username` | `FriendDto` — demande, ou acceptation si demande entrante |
| DELETE  | `/friends/:userId`   | 204                                                       |

## Messagerie

Conversations privées (entre amis uniquement) et groupes (50 membres maximum, composés d'amis de la personne qui ajoute). Toute conversation dont on n'est pas membre répond 404.

| Méthode | Route                                        | Corps                  | Réponse                                                                                       |
| ------- | -------------------------------------------- | ---------------------- | --------------------------------------------------------------------------------------------- |
| GET     | `/conversations?cursor=&limit=`              | —                      | `Paginated<ConversationDto>` — la plus récente d'abord                                        |
| GET     | `/conversations/unread-count`                | —                      | `{ count }`                                                                                   |
| POST    | `/conversations/direct`                      | `{ userId }`           | `ConversationDto` — retrouvée si elle existe ; **403** si non amis                            |
| POST    | `/conversations/group`                       | `{ title, memberIds }` | `ConversationDto` (vous êtes propriétaire)                                                    |
| GET     | `/conversations/:id`                         | —                      | `ConversationDto`                                                                             |
| PATCH   | `/conversations/:id`                         | `{ title }`            | `ConversationDto` — propriétaire ou administrateur                                            |
| POST    | `/conversations/:id/members`                 | `{ userIds }`          | `ConversationDto` — propriétaire ou administrateur                                            |
| DELETE  | `/conversations/:id/members/:userId`         | —                      | 204 — retirer un membre ; son propre id = quitter                                             |
| GET     | `/conversations/:id/messages?before=&limit=` | —                      | `Paginated<MessageDto>` — du plus récent au plus ancien ; `before` = id du plus ancien chargé |
| POST    | `/conversations/:id/messages`                | `{ body, clientId? }`  | `MessageDto` — **403** si la conversation privée est en lecture seule                         |
| DELETE  | `/conversations/:id/messages/:messageId`     | —                      | 204 — ses propres messages                                                                    |
| POST    | `/conversations/:id/read`                    | —                      | 204 — tout marquer comme lu                                                                   |

### Temps réel

Socket.IO, espace de noms `/messaging`, authentifié par le jeton d'accès : `io('/messaging', { auth: { token } })`. Un jeton invalide ferme la connexion. Événements reçus (types dans `src/shared`) :

| Événement              | Charge                               | Quand                                                            |
| ---------------------- | ------------------------------------ | ---------------------------------------------------------------- |
| `message:new`          | `{ conversationId, message }`        | nouveau message (y compris les siens, pour les autres appareils) |
| `message:deleted`      | `{ conversationId, messageId }`      | message supprimé                                                 |
| `conversation:updated` | `{ conversationId }`                 | titre ou membres modifiés : recharger la conversation            |
| `conversation:removed` | `{ conversationId }`                 | vous avez été retiré du groupe                                   |
| `conversation:read`    | `{ conversationId, userId, readAt }` | un membre a tout lu                                              |
| `typing`               | `{ conversationId, userId }`         | un membre écrit (à émettre aussi : `{ conversationId }`)         |
| `friends:changed`      | `{}`                                 | demande, acceptation ou retrait d'ami : recharger `/friends`     |

## Signalements

| Méthode | Route      | Corps                                                               | Réponse                                                                                                  |
| ------- | ---------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| POST    | `/reports` | `CreateReportRequest` (`targetType` : book, chapter, user, message) | `{ message }` — 404 si la cible n'est pas visible ; un seul signalement ouvert par personne et par cible |

## Administration (rôle `moderator` ou `admin`, sinon 403)

| Méthode | Route                                                     | Corps                                         | Réponse                                                     |
| ------- | --------------------------------------------------------- | --------------------------------------------- | ----------------------------------------------------------- |
| GET     | `/admin/stats`                                            | —                                             | `AdminStatsDto`                                             |
| GET     | `/admin/reports?status=open\|resolved\|dismissed&cursor=` | —                                             | `Paginated<ReportDto>` (ouverts : les plus anciens d'abord) |
| POST    | `/admin/reports/:id/resolve`                              | `{ decision: dismiss\|hide\|suspend, note? }` | 204 — clôt tous les signalements ouverts de la cible        |
| POST    | `/admin/content/:type/:id/hide` · `/unhide`               | `{ reason? }`                                 | 204 — `type` : book, chapter, message                       |
| GET     | `/admin/users?q=&cursor=`                                 | —                                             | `Paginated<AdminUserDto>`                                   |
| POST    | `/admin/users/:id/suspend` · `/reinstate`                 | `{ reason? }`                                 | 204 — jamais sur un rang égal ou supérieur                  |
| PATCH   | `/admin/users/:id/role`                                   | `{ role }`                                    | 204 — **admin uniquement**                                  |
| GET     | `/admin/actions?cursor=`                                  | —                                             | `Paginated<ModerationActionDto>` (journal)                  |

Un contenu masqué (`hiddenAt` dans `BookDto`/`ChapterDto`) n'est visible que de son auteur. Un compte suspendu ne peut plus se connecter ; ses sessions sont révoquées.

## Catalogue public

| Méthode | Route                                                     | Réponse                              |
| ------- | --------------------------------------------------------- | ------------------------------------ |
| GET     | `/catalog?q=&genre=&sort=recent\|trending&cursor=&limit=` | `Paginated<BookDto>`                 |
| GET     | `/catalog/genres`                                         | `{ genre: string; count: number }[]` |

Les images téléversées sont servies sous `/uploads/...` (pilote local) ou via l'URL publique S3/CDN.
