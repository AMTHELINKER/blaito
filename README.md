# blaito — API Laito

API REST de **Laito**, PWA d'écriture et de partage de livres. Le front (PWA React) est dans le dépôt [flaito](https://github.com/AMTHELINKER/flaito).

NestJS · TypeScript · TypeORM · PostgreSQL · Redis (BullMQ) — REST versionnée `/api/v1`, documentée avec Swagger sur `/api/docs`.

## Démarrer

Disposition recommandée : les deux dépôts côte à côte.

```
laito/
├── api/   git clone https://github.com/AMTHELINKER/blaito.git api
└── web/   git clone https://github.com/AMTHELINKER/flaito.git web
```

Prérequis : Node 22, pnpm (`corepack enable`), Docker.

```bash
pnpm install
cp .env.example .env
pnpm db:up            # PostgreSQL (port 5433) + Redis (port 6380)
pnpm migration:run
pnpm seed             # facultatif : demo@laito.app / laito-demo
pnpm dev              # http://localhost:3000/api/v1 — docs : /api/docs
```

Sans `SMTP_HOST`, les e-mails (vérification, mot de passe) s'affichent dans les logs. Pour une vraie boîte de test : `docker compose --profile mail up -d mailpit`, `SMTP_HOST=localhost`, puis http://localhost:8025.

Toute la pile en conteneurs : `docker compose --profile app up --build`.

## Commandes

| Commande                                                | Effet                                                                  |
| ------------------------------------------------------- | ---------------------------------------------------------------------- |
| `pnpm lint` / `pnpm typecheck` / `pnpm test`            | qualité et tests unitaires                                             |
| `pnpm test:e2e`                                         | critères d'acceptation du MVP (PostgreSQL + Redis + migrations requis) |
| `pnpm migration:generate src/database/migrations/<Nom>` | générer une migration après un changement d'entité                     |
| `pnpm migration:revert`                                 | annuler la dernière migration                                          |

## Architecture

Un domaine = un module NestJS = un schéma PostgreSQL :

| Domaine      | Schéma     | Rôle                                                                        |
| ------------ | ---------- | --------------------------------------------------------------------------- |
| identité     | `identity` | comptes, profils, sessions, paramètres, jetons e-mail                       |
| écriture     | `writing`  | livres, chapitres, contenus (séparés des métadonnées), versions, étiquettes |
| partage      | `sharing`  | liens de partage, invitations, **service d'autorisation unique**            |
| social       | `social`   | amitiés (nécessaires à la visibilité « amis »)                              |
| bibliothèque | `library`  | progression de lecture, favoris                                             |
| catalogue    | —          | composition : recherche publique, profils auteurs                           |

Les domaines ne lisent jamais les tables des autres. Ils passent par les services exportés ou par des événements (`user.deleted`, `user.export`, `writing.book.deleted`). Aucune clé étrangère entre schémas ; clés primaires en UUID v7.

Le contrat de l'API est décrit dans [docs/API.md](docs/API.md).

## Code partagé avec le front

`src/shared/` contient les types des réponses et les règles du texte (syntaxe légère, comptage de mots). **Ce dépôt en est la source de vérité.**

Flaito en garde une copie, qu'il ne modifie jamais directement :

1. modifiez `src/shared/` ici et poussez sur `main` ;
2. dans `web/` (flaito), lancez `pnpm shared:sync` (il lit `../api`), puis commitez la copie mise à jour.

La CI de flaito (à chaque push et chaque jour) échoue si sa copie diffère de `src/shared/` sur la branche `main` de blaito. Un changement qui casse le contrat de l'API apparaît donc tout de suite côté front.

## Migrations

`synchronize` est désactivé partout. Tout changement de schéma passe par une migration générée, relue, versionnée et dotée d'une méthode `down`. La CI vérifie le cycle up → down → up et l'absence d'écart entre entités et migrations (`migration:generate --check`). Le conteneur exécute `migration:run` avant de démarrer.

## Règles à connaître

- **Visibilité** : un chapitre n'est lisible que si son livre l'est ; un non-auteur ne voit jamais un brouillon ; une invitation nominative ouvre la ressource quel que soit son niveau. Toute ressource non autorisée répond **404**. Les règles sont des fonctions pures testées : `src/sharing/access-policy.ts`.
- **Lien privé** : créer un lien sur une ressource privée la passe en « lien privé ». Repasser en privé coupe tous les liens ; révoquer un lien ne coupe que lui.
- **Sauvegarde** : si deux appareils écrivent en parallèle, la version écrasée est conservée dans `chapter_versions`.
- **Sessions** : JWT d'accès de 15 min ; refresh token de 30 jours en cookie httpOnly (`laito_rt`), haché en base, renouvelé à chaque usage. Une réutilisation invalide la session.
- **Images** : 5 Mo maximum, JPG/PNG/WebP vérifiés sur le contenu du fichier. Stockage local en développement, compatible S3 en production (`STORAGE_DRIVER=s3`).
