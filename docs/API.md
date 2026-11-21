# API Laito v1

Base : `/api/v1` — documentation interactive : `/api/docs` (Swagger).
Types de réponse : voir `src/shared/index.ts`.

## Authentification

- Jeton d'accès JWT (15 min) dans l'en-tête `Authorization: Bearer <token>`.
- Refresh token (30 j) dans le cookie httpOnly `laito_rt` (path `/api/v1/auth`), avec rotation.
- Toutes les requêtes du front utilisent `credentials: 'include'`.

| Méthode | Route | Corps | Réponse |
|---|---|---|---|
| POST | `/auth/register` | `RegisterRequest` | `{ message }` — e-mail de vérification envoyé |
| POST | `/auth/verify-email` | `{ token }` | `AuthResponse` + cookie |
| POST | `/auth/resend-verification` | `{ email }` | `{ message }` |
| POST | `/auth/login` | `LoginRequest` | `AuthResponse` + cookie ; **403** `EMAIL_NOT_VERIFIED` si non vérifié |
| POST | `/auth/refresh` | — (cookie) | `AuthResponse` |
| POST | `/auth/logout` | — | 204 |
| POST | `/auth/forgot-password` | `{ email }` | `{ message }` (toujours 200) |
| POST | `/auth/reset-password` | `{ token, password }` | `{ message }` |

## Compte

| Méthode | Route | Corps | Réponse |
|---|---|---|---|
| GET | `/me` | — | `MeDto` |
| PATCH | `/me/profile` | `{ username?, displayName?, bio?, links? }` | `ProfileDto` |
| POST | `/me/avatar` | multipart `file` | `ProfileDto` |
| PATCH | `/me/settings` | `Partial<UserSettingsDto>` (readingPreferences fusionnées) | `UserSettingsDto` |
| GET | `/me/export` | — | export JSON complet (RGPD) |
| DELETE | `/me` | `{ password }` | 204 |
| GET | `/profiles/:username` | — | `{ profile: ProfileDto, books: BookDto[] }` (livres publics) |

## Écriture (propriétaire uniquement, sinon 404)

| Méthode | Route | Corps | Réponse |
|---|---|---|---|
| GET | `/books/mine` | — | `BookDto[]` |
| POST | `/books` | `CreateBookRequest` | `BookDto` (privé, brouillon) |
| GET | `/books/:id` | — | `BookDto` |
| PATCH | `/books/:id` | `UpdateBookRequest` | `BookDto` |
| DELETE | `/books/:id` | — | 204 (suppression douce) |
| POST | `/books/:id/restore` | — | `BookDto` (annulation de suppression) |
| POST | `/books/:id/cover` | multipart `file` (≤ 5 Mo, JPG/PNG/WebP) | `BookDto` |
| GET | `/books/:id/chapters` | — | `ChapterDto[]` (sans contenu) |
| POST | `/books/:id/chapters` | `CreateChapterRequest` | `ChapterDto` |
| PUT | `/books/:id/chapters/order` | `ReorderChaptersRequest` | `ChapterDto[]` — une seule requête |
| PATCH | `/chapters/:id` | `UpdateChapterRequest` | `ChapterDto` |
| DELETE | `/chapters/:id` | — | 204 |
| GET | `/chapters/:id/content` | — | `ChapterContentDto` |
| PUT | `/chapters/:id/content` | `SaveContentRequest` | `ChapterContentDto` |

## Lecture (soumise au service d'autorisation ; non autorisé → 404)

Paramètre optionnel `?share=<token>` pour lire via un lien privé.

| Méthode | Route | Réponse |
|---|---|---|
| GET | `/read/books/:id` | `ReadableBookDto` |
| GET | `/read/chapters/:id` | `ReadableChapterDto` |
| PUT | `/read/progress` | corps `{ bookId, chapterId, position }` → `ReadingProgressDto` |
| GET | `/read/progress` | `(ReadingProgressDto & { book: BookDto })[]` — lectures en cours |

## Partage

| Méthode | Route | Corps | Réponse |
|---|---|---|---|
| GET | `/share/links?resourceType=&resourceId=` | — | `ShareLinkDto[]` |
| POST | `/share/links` | `CreateShareLinkRequest` | `ShareLinkDto` |
| DELETE | `/share/links/:id` | — | 204 (révocation) |
| GET | `/share/resolve/:token` | — | `{ resourceType, resourceId, bookId }` (public) |
| GET | `/share/grants?resourceType=&resourceId=` | — | `AccessGrantDto[]` |
| POST | `/share/grants` | `CreateAccessGrantRequest` | `AccessGrantDto` |
| DELETE | `/share/grants/:id` | — | 204 |
| GET | `/share/with-me` | — | `BookDto[]` |

## Amis (minimal MVP, requis pour la visibilité « amis »)

| Méthode | Route | Réponse |
|---|---|---|
| GET | `/friends` | `FriendDto[]` |
| POST | `/friends/:username` | `FriendDto` — demande, ou acceptation si demande entrante |
| DELETE | `/friends/:userId` | 204 |

## Catalogue public

| Méthode | Route | Réponse |
|---|---|---|
| GET | `/catalog?q=&genre=&sort=recent\|trending&cursor=&limit=` | `Paginated<BookDto>` |
| GET | `/catalog/genres` | `{ genre: string; count: number }[]` |

Les images téléversées sont servies sous `/uploads/...` (pilote local) ou via l'URL publique S3/CDN.
