# Stage 1 : installation des dépendances de production uniquement
FROM node:22.14.0-alpine AS deps
WORKDIR /app
# Dépendances d'abord : tant que package*.json ne change pas, cette couche reste en cache
COPY package*.json ./
RUN npm ci --omit=dev

# Stage 2 : image finale sur Alpine nu. Au runtime on n'a besoin que du
# binaire node : npm, yarn et corepack (~150 Mo dans l'image node officielle)
# restent dans le stage de build.
FROM alpine:3.21
WORKDIR /app
ENV NODE_ENV=production

# node est lié dynamiquement à libstdc++/libgcc, absents d'Alpine nu.
# L'image alpine ne fournit pas d'utilisateur node : on le crée nous-même.
RUN apk add --no-cache libstdc++ libgcc \
  && addgroup -g 1000 node \
  && adduser -u 1000 -G node -s /bin/sh -D node

COPY --from=deps /usr/local/bin/node /usr/local/bin/node
COPY --from=deps /app/node_modules ./node_modules
COPY package*.json ./
COPY src ./src

# Utilisateur non privilégié : le process final n'a plus les droits root
USER node

EXPOSE 3000

# Sonde toutes les 30s que l'app répond vraiment, pas juste qu'elle a démarré
HEALTHCHECK --interval=30s --timeout=3s \
  CMD node -e "require('http').get('http://localhost:3000/health', r => process.exit(r.statusCode === 200 ? 0 : 1))"

# Forme exec : le process devient PID 1 et reçoit SIGTERM correctement
CMD ["node", "src/server.js"]
