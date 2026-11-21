FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build && pnpm prune --prod

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
RUN mkdir -p uploads && chown node:node uploads
USER node
EXPOSE 3000
# Les migrations sont exécutées automatiquement à chaque déploiement, avant le démarrage.
CMD ["sh", "-c", "./node_modules/.bin/typeorm migration:run -d dist/database/data-source.js && node dist/main.js"]
