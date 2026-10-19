# NEKAI AI service: Neko chat and Nekai's Picks (Gemini). No database.
# Stages: base (dependencies + source) → test (`docker build --target test`) → production.
FROM node:24-alpine AS base
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .

# ---- test stage: a failing test fails the build here ----
FROM base AS test
RUN npm test

# ---- production stage: small image, runs as the unprivileged "node" user ----
FROM node:24-alpine AS production
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3001
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=base /app/src ./src
USER node
EXPOSE 3001
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3001/health || exit 1
CMD ["node", "src/server.js"]
