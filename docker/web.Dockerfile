# ---- build ----
FROM node:20-bookworm-slim AS builder

WORKDIR /app

ARG NEXT_PUBLIC_API_URL=http://localhost:3001
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json package-lock.json ./
COPY apps/cloud-web/package.json ./apps/cloud-web/
COPY packages/shared-types/package.json ./packages/shared-types/

RUN npm ci -w cloud-web --include-workspace-root

COPY apps/cloud-web ./apps/cloud-web
COPY packages/shared-types ./packages/shared-types

WORKDIR /app/apps/cloud-web
RUN npm run build

# ---- runtime ----
FROM node:20-bookworm-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV NEXT_TELEMETRY_DISABLED=1

RUN groupadd --system --gid 1001 lede \
  && useradd --system --uid 1001 --gid lede lede

# Next standalone (monorepo): estrutura em .next/standalone
COPY --from=builder /app/apps/cloud-web/public ./apps/cloud-web/public
COPY --from=builder /app/apps/cloud-web/.next/standalone ./
COPY --from=builder /app/apps/cloud-web/.next/static ./apps/cloud-web/.next/static

RUN chown -R lede:lede /app
USER lede

WORKDIR /app/apps/cloud-web
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
