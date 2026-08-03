# ---- build ----
FROM node:20-bookworm-slim AS builder

WORKDIR /app

RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY apps/cloud-api/package.json ./apps/cloud-api/
COPY packages/shared-types/package.json ./packages/shared-types/

RUN npm ci -w cloud-api --include-workspace-root

COPY apps/cloud-api ./apps/cloud-api
COPY packages/shared-types ./packages/shared-types

WORKDIR /app/apps/cloud-api
RUN npx prisma generate && npm run build

# ---- runtime ----
FROM node:20-bookworm-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001

RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd --system --gid 1001 lede \
  && useradd --system --uid 1001 --gid lede lede

COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/cloud-api/package.json ./apps/cloud-api/
COPY --from=builder /app/apps/cloud-api/dist ./apps/cloud-api/dist
COPY --from=builder /app/apps/cloud-api/prisma ./apps/cloud-api/prisma
COPY --from=builder /app/apps/cloud-api/node_modules ./apps/cloud-api/node_modules
COPY docker/api-entrypoint.sh /app/docker/api-entrypoint.sh

RUN chmod +x /app/docker/api-entrypoint.sh \
  && mkdir -p /app/apps/cloud-api/uploads \
  && chown -R lede:lede /app

WORKDIR /app/apps/cloud-api
# Roda como root no container para o volume de uploads funcionar no Dokploy
# (UID do volume costuma ser root). O processo escuta só na rede Docker.
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=50s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/api/auth/me').then(r=>process.exit(r.status===401||r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/app/docker/api-entrypoint.sh"]
