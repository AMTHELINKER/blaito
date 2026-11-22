# Déployer Laito gratuitement

Architecture retenue : **un seul service web** qui sert l'API et la PWA sur le même domaine, une base PostgreSQL gérée, un stockage d'images compatible S3 et un relais SMTP. Tout est gratuit, sans serveur à administrer.

| Rôle                          | Service                                                          | Offre gratuite (à vérifier, elles évoluent)                                                                         |
| ----------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| API + PWA                     | [Render](https://render.com) — service web Docker                | 512 Mo de RAM, mise en veille après 15 min sans visite (≈ 1 min de réveil), 750 h/mois, 5 Go de bande passante/mois |
| PostgreSQL                    | [Neon](https://neon.com)                                         | 0,5 à 1 Go de données, mise en veille après 5 min (réveil ≈ 1 s)                                                    |
| Images (couvertures, avatars) | [Supabase Storage](https://supabase.com) (S3) — ou Cloudflare R2 | 1 Go (Supabase, sans carte) ; 10 Go (R2)                                                                            |
| E-mails                       | [Brevo](https://www.brevo.com) (SMTP)                            | 300 e-mails/jour                                                                                                    |

Pourquoi l'API HTTP de Brevo et pas le SMTP : depuis septembre 2025, Render bloque le SMTP sortant (ports 25, 465 et 587) sur ses services gratuits. L'API passe par HTTPS (port 443).

Pourquoi un seul domaine : le cookie de session reste « first-party ». Avec le front et l'API sur deux domaines, Safari (donc tous les iPhone) bloquerait ce cookie, et la reconnexion automatique échouerait. Le WebSocket de la messagerie passe aussi sans configuration supplémentaire.

Sans Redis, l'API envoie les e-mails directement et gère le temps réel en mémoire : c'est adapté à une seule instance. Pour plusieurs instances, ajoutez `REDIS_URL`.

## 1. Base de données — Neon

1. Créez un projet (région **Europe (Frankfurt)**, la même que le service Render).
2. Copiez la chaîne de connexion **directe** (sans « pooler »), de la forme
   `postgresql://utilisateur:motdepasse@ep-xxx.eu-central-1.aws.neon.tech/neondb?sslmode=require`.

Les migrations sont appliquées automatiquement à chaque déploiement.

## 2. Images — Supabase Storage

1. Créez un projet Supabase (gratuit), puis **Storage → New bucket** : nom `laito`, cochez **Public bucket**.
2. **Project Settings → Storage → S3 Connection** : activez la connexion S3 et créez une clé d'accès.
3. Notez :
   - `S3_ENDPOINT` = `https://<ref>.supabase.co/storage/v1/s3`
   - `S3_REGION` = la région affichée (ex. `eu-central-1`)
   - `S3_BUCKET` = `laito`
   - `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` = la clé créée
   - `S3_PUBLIC_URL` = `https://<ref>.supabase.co/storage/v1/object/public/laito`

> Variante Cloudflare R2 : `S3_ENDPOINT=https://<compte>.r2.cloudflarestorage.com`, `S3_REGION=auto`, et `S3_PUBLIC_URL` = l'URL publique du bucket (domaine `r2.dev` ou domaine personnalisé).

## 3. E-mails — Brevo

1. Créez un compte, validez l'adresse d'expéditeur (**Senders, Domains & Dedicated IPs → Senders**).
2. **SMTP & API → onglet API keys → Generate a new API key** : c'est `BREVO_API_KEY`.
3. `MAIL_FROM="Laito <adresse validée chez Brevo>"`.
4. Vérifiez depuis votre machine : `ENV_FILE=.env.production pnpm mail:check vous@exemple.fr`.

Les identifiants SMTP de Brevo ne servent pas sur Render (port bloqué) ; ils restent utilisables en local.

## 4. Service web — Render

1. **New → Blueprint**, connectez le dépôt GitHub `blaito` : Render lit `render.yaml`.
2. Renseignez les variables demandées :
   - `DATABASE_URL` (Neon)
   - `S3_*` (étape 2)
   - `BREVO_API_KEY`, `MAIL_FROM="Laito <adresse validée chez Brevo>"`
   - `JWT_ACCESS_SECRET` est généré automatiquement.
3. Lancez le déploiement. Render construit l'image `deploy/render/Dockerfile` : il récupère et construit le front (dépôt `flaito`), puis l'API.
4. L'application est en ligne sur `https://laito.onrender.com` (ou le nom choisi). `WEB_ORIGIN` et `API_PUBLIC_URL` prennent automatiquement cette adresse (`RENDER_EXTERNAL_URL`) ; renseignez-les seulement avec un domaine personnalisé.

### Mises à jour automatiques

- **API (`blaito`)** : Render redéploie à chaque push sur `main`, une fois la CI GitHub verte (`autoDeployTrigger: checksPass`).
- **Front (`flaito`)** : dans Render, **Settings → Deploy Hook**, copiez l'URL, puis dans GitHub `flaito` → **Settings → Secrets and variables → Actions**, créez le secret `RENDER_DEPLOY_HOOK_URL`. La CI de `flaito` déclenche alors un redéploiement après chaque push vert sur `main`.

## 5. Vérifier

- `https://<votre-app>.onrender.com/api/v1/health` → `{"status":"ok"}`
- Inscrivez-vous : l'e-mail de vérification doit arriver (sinon, consultez les logs Render).
- Ajoutez une couverture : l'image doit s'afficher après un redémarrage du service (elle est sur le stockage S3).
- Lighthouse (onglet PWA) : l'application doit être installable.

## 6. Compte administrateur

Aucune route de l'API ne permet de s'attribuer un rôle. On promeut un compte existant depuis sa machine, directement en base :

1. Inscrivez-vous sur l'application en ligne et validez l'e-mail reçu.
2. Depuis `api/`, avec les valeurs de production dans `.env.production` :
   ```bash
   ENV_FILE=.env.production pnpm user:role vous@exemple.fr admin
   ```
3. Déconnectez-vous puis reconnectez-vous : le jeton porte désormais le rôle `admin`.

Rôles disponibles : `user`, `moderator`, `admin`. La même commande sert à rétrograder (`… user`).

## Limites à connaître

- **Mise en veille** : après 15 min sans visite, le premier chargement prend environ une minute. La tâche GitHub Actions `.github/workflows/keepalive.yml` appelle `/api/v1/health` toutes les 5 min pour l'éviter (750 h mensuelles gratuites : suffisantes pour un seul service allumé en permanence). Pour une autre adresse, définissez la variable de dépôt `KEEPALIVE_URL`. GitHub peut retarder ces tâches ; pour une ponctualité stricte, un service comme UptimeRobot fait la même chose.
- **Bande passante** : 5 Go/mois chez Render. Les images sont servies par le stockage S3, pas par Render.
- **Sauvegardes** : Neon conserve un historique de restauration de quelques heures sur l'offre gratuite. Pour une vraie sauvegarde, planifiez un `pg_dump` (par ex. une action GitHub hebdomadaire).
- **Montée en charge** : pour plusieurs instances, ajoutez un Redis (`REDIS_URL`) — files d'e-mails et temps réel partagés.
