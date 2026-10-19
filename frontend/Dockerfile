# NEKAI frontend: the static site, served by Nginx (unprivileged image: runs as a non-root
# user and listens on 8080). The config is baked in, so there is no bind mount.
# Two stages:
#   test        `docker build --target test` checks the site (links, scripts, styles, health route);
#               the pipeline's quality gate. Nothing from this stage ends up in the final image.
#   production  the Nginx image (compose builds this one: target: production)

# ---- test stage: a broken page, script or link fails the build here ----
FROM node:24.22.0-alpine AS test
WORKDIR /site
COPY . .
RUN node --test "tests/*.test.js"

# ---- production stage ----
FROM nginxinc/nginx-unprivileged:1.27.5-alpine AS production

# The pipeline passes the build number (compose: ${TAG}); the page shows it as "Build <n>"
ARG BUILD_NUMBER=dev

USER root
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY . /usr/share/nginx/html/
RUN rm -rf /usr/share/nginx/html/nginx.conf /usr/share/nginx/html/tests
RUN printf '{"build":"%s"}\n' "$BUILD_NUMBER" > /usr/share/nginx/html/build.json
USER nginx

EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/health || exit 1
