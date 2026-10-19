# NEKAI reverse proxy: the single public entry point. Config is baked in (no bind mount).
# Unprivileged Nginx image: runs as a non-root user and listens on 8080.
FROM nginxinc/nginx-unprivileged:1.27.5-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/health || exit 1
