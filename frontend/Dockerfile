# =============================================================================
# Production Dockerfile for the Faculty Management frontend (Vite SPA).
# - Build with Node, ship as static assets served by nginx.
# - The SPA is statically rendered, so the nginx container does NOT need
#   to run as a privileged user. We still drop root where possible.
# =============================================================================

# ---- Stage 1: build --------------------------------------------------------
FROM node:20-bullseye-slim AS build

WORKDIR /app/frontend

# Vite reads these at build time
ARG VITE_API_BASE_URL=
ARG VITE_API_PROXY_TARGET=/api
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
ENV VITE_API_PROXY_TARGET=${VITE_API_PROXY_TARGET}

COPY frontend/package*.json ./
RUN npm install

COPY frontend/ ./
RUN npm run build

# ---- Stage 2: runtime -----------------------------------------------------
FROM nginx:1.27-alpine

# Drop root. The `nginx` user (UID 101) is provided by the official image.
# We need write access to /var/cache/nginx, /var/run, and the pid file.
RUN touch /var/run/nginx.pid \
    && chown -R nginx:nginx /var/cache/nginx /var/log/nginx /etc/nginx/conf.d /usr/share/nginx/html /var/run/nginx.pid

USER nginx

# Copy the production nginx config baked for SPA + reverse proxy
COPY --chown=nginx:nginx frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build --chown=nginx:nginx /app/frontend/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=15s --timeout=5s --retries=5 \
  CMD wget -q -O- http://127.0.0.1/ || exit 1

# Tini-style signal handling via dumb-init
ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]
