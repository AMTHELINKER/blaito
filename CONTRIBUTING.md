# Contribuer

## Flux de travail

1. Une branche par fonctionnalité depuis `main` : `feat/partage-chapitre`, `fix/sauvegarde-hors-ligne`…
2. Commits conventionnels, vérifiés par un hook : `feat(editeur): raccourci nouveau chapitre`.
   Types : `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `ci`, `perf`, `style`.
3. Pull request vers `main`, avec le modèle rempli. Revue obligatoire ; la CI doit être verte.

## Hooks git (installés par `pnpm install`)

- **pre-commit** : ESLint et Prettier sur les fichiers modifiés (lint-staged).
- **commit-msg** : refuse un message qui ne suit pas la convention (commitlint).

## Définition de « terminé »

- Critères d'acceptation couverts par un test automatisé, tests verts.
- `pnpm format:check`, `pnpm lint` et `pnpm typecheck` passent.
- Documentation à jour (README, `docs/API.md` pour l'API).

## Dépendances

Dependabot propose chaque semaine une PR groupée pour les mises à jour mineures. La CI refuse une dépendance de production avec une faille de gravité haute (`pnpm audit`).

## Base de données

Tout changement d'entité s'accompagne d'une migration générée (`pnpm migration:generate src/database/migrations/<Nom>`), relue, avec sa méthode `down`. La CI vérifie l'aller-retour et l'absence d'écart.

## Code partagé

`src/shared/` est la source de vérité des types communs au front : après modification, lancez `pnpm shared:sync` dans `web/`.
