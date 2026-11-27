# ==============================================================================
# Multi-stage Dockerfile for Dorm Trading Platform Admin Web (React 18 + Vite 6 + Nginx)
# ==============================================================================
FROM node:24-alpine AS build

WORKDIR /app

ARG VITE_API_URL=/api/v1
ENV VITE_API_URL=${VITE_API_URL}

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# ==============================================================================
# Runtime Stage (Nginx 1.27 Alpine serving SPA + reverse proxy /api/ -> backend:8082)
# ==============================================================================
FROM nginx:1.27-alpine AS runtime

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- http://127.0.0.1/nginx-health >/dev/null || exit 1

CMD ["nginx", "-g", "daemon off;"]
