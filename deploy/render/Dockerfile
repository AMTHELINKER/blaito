# Laito en un seul service (hébergement gratuit) : l'API NestJS sert aussi la PWA.
# Le front est récupéré depuis son dépôt (flaito) et construit ici.
#   docker build -f deploy/render/Dockerfile .
ARG NODE_IMAGE=node:22-alpine

# ── Front (PWA) ──
FROM ${NODE_IMAGE} AS web
ARG WEB_REPO=https://github.com/AMTHELINKER/flaito.git
ARG WEB_REF=main
RUN apk add --no-cache git && corepack enable
WORKDIR /web
# Sans cette ligne, Docker réutiliserait le clone mis en cache et servirait un front périmé :
# le contenu téléchargé (dernier commit de la branche) change à chaque push sur flaito,
# ce qui invalide le cache des étapes suivantes.
ADD https://api.github.com/repos/AMTHELINKER/flaito/commits/${WEB_REF} /tmp/web-commit.json
RUN git clone --depth 1 --branch "$WEB_REF" "$WEB_REPO" . && git log -1 --format='Front : %h %s'
RUN pnpm install --frozen-lockfile && pnpm build

# ── API ──
FROM ${NODE_IMAGE} AS api
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build && pnpm prune --prod

# ── Exécution ──
FROM ${NODE_IMAGE}
ENV NODE_ENV=production \
    WEB_DIR=/app/web
WORKDIR /app
COPY --from=api /app/package.json ./
COPY --from=api /app/node_modules ./node_modules
COPY --from=api /app/dist ./dist
COPY --from=web /web/dist ./web
USER node
EXPOSE 3000
# Les migrations sont appliquées à chaque déploiement, avant le démarrage.
CMD ["sh", "-c", "./node_modules/.bin/typeorm migration:run -d dist/database/data-source.js && node dist/main.js"]
