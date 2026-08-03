# Stage 1 : installation des dépendances de production uniquement
FROM node:22.14.0-alpine AS deps
WORKDIR /app
# Dépendances d'abord : tant que package*.json ne change pas, cette couche reste en cache
COPY package*.json ./
RUN npm ci --omit=dev

# Stage 2 : image finale, on ne récupère que le nécessaire au runtime
FROM node:22.14.0-alpine
WORKDIR /app
ENV NODE_ENV=production

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
