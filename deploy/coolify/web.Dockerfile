# syntax=docker/dockerfile:1.20@sha256:26147acbda4f14c5add9946e2fd2ed543fc402884fd75146bd342a7f6271dc1d
FROM oven/bun:1.3.11@sha256:0733e50325078969732ebe3b15ce4c4be5082f18c4ac1a0f0ca4839c2e4e42a7 AS builder

WORKDIR /app

COPY . .

RUN bun install --frozen-lockfile --ignore-scripts \
    --filter='./clients/web'
RUN cd clients/web && bun run openapi-ts && bun run build

FROM nginx:1.27.5-alpine

COPY deploy/coolify/web-nginx.conf /etc/nginx/conf.d/default.conf
COPY deploy/coolify/web-entrypoint.sh /docker-entrypoint.d/99-vellum-web.sh
COPY --from=builder /app/clients/web/dist /usr/share/nginx/html

RUN chmod +x /docker-entrypoint.d/99-vellum-web.sh
