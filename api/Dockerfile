# NEKAI api service: accounts, user data (PostgreSQL) and anime data (Tenrai).
# Three stages:
#   base        dependencies + source
#   test        `docker build --target test` runs the tests inside Docker (the pipeline's quality gate)
#   production  small image: no dev files, runs as the unprivileged "node" user
FROM node:24-alpine AS base
WORKDIR /app
# Dependency files first, so this layer is cached until package*.json changes
COPY package*.json ./
RUN npm ci
COPY . .

# ---- test stage: a failing test fails the build here ----
FROM base AS test
RUN npm test

# ---- production stage ----
FROM node:24-alpine AS production
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    UPLOAD_DIR=/data/uploads
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=base /app/src ./src
# Profile pictures live in /data/uploads, which compose mounts as a named volume.
# Created and owned by "node" here, so the volume starts out writable by it.
RUN mkdir -p /data/uploads && chown -R node:node /data
USER node
EXPOSE 3000
# 200 only when the api can also reach PostgreSQL
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "src/server.js"]
