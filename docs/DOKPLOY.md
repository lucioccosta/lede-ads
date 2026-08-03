# Deploy no Dokploy

Guia para subir **LEDE Ads** (web + API + Postgres) no [Dokploy](https://dokploy.com) com Docker Compose.

## Arquivos

| Arquivo | Uso |
|---------|-----|
| `docker-compose.dokploy.yml` | Stack de produção |
| `docker/api.Dockerfile` | NestJS + Prisma migrate |
| `docker/web.Dockerfile` | Next.js (standalone) |
| `.env.dokploy.example` | Modelo de variáveis |

## 1. Domínios (DNS)

Crie dois registros apontando para o servidor Dokploy:

- `app.lede.tv.br` → front (Cloud Web)
- `api.lede.tv.br` → API (Edge e browser usam esta URL)

## 2. Criar aplicação Compose

1. Dokploy → **Create** → **Compose**
2. Source: Git do repositório `lede-ads`
3. **Compose Path:** `docker-compose.dokploy.yml`
4. Salve

### Rede Traefik

O compose usa a rede externa `dokploy-network`. Ela já existe no Dokploy.  
Se o deploy falhar com “network dokploy-network not found”:

```bash
docker network create dokploy-network
```

## 3. Variáveis de ambiente

Aba **Environment** — cole e ajuste (base: `.env.dokploy.example`):

```env
POSTGRES_USER=lede
POSTGRES_PASSWORD=<senha-forte>
POSTGRES_DB=lede_ads

JWT_SECRET=<segredo-longo>
JWT_EXPIRES_IN=7d
PUBLIC_BASE_URL=https://api.lede.tv.br
CORS_ORIGIN=https://app.lede.tv.br

RUN_SEED=true
SEED_ADMIN_EMAIL=admin@lede.com
SEED_ADMIN_PASSWORD=<senha-admin>
SEED_ADMIN_NAME=Admin LEDE

NEXT_PUBLIC_API_URL=https://api.lede.tv.br

# S3 (Eveo)
STORAGE_DRIVER=s3
S3_ENDPOINT=https://object.sp2.eveo.com.br
S3_REGION=us-east-1
S3_BUCKET=lede-arquivos
S3_TENANT=48806696000174
S3_ACCESS_KEY=<access-key>
S3_SECRET_KEY=<secret-key>
S3_PUBLIC_URL=https://object.sp2.eveo.com.br/48806696000174:lede-arquivos
S3_FORCE_PATH_STYLE=true
```


Importante:

- `NEXT_PUBLIC_API_URL` e `PUBLIC_BASE_URL` = URL **pública** da API (HTTPS), **sem** `/api` no final  
- `CORS_ORIGIN` = URL do front  
- `RUN_SEED=true` só no **primeiro** deploy; depois mude para `false` e faça redeploy  

## 4. Domínios dos serviços

No Dokploy, vincule:

| Service | Port | Domain |
|---------|------|--------|
| `web` | `3000` | `app.lede.tv.br` |
| `api` | `3001` | `api.lede.tv.br` |

Ative HTTPS (Let's Encrypt) nos dois.

## 5. Deploy

1. **Deploy** / **Rebuild**
2. Aguarde build da API e do Web
3. Login: `https://app.lede.tv.br` com o admin do seed
4. Desative o seed: `RUN_SEED=false` → Save → Redeploy (ou só Restart se a imagem não mudar)

## 6. Edge Android

Em `apps/edge-android/.../build.gradle.kts` (ou flavor de release):

```
API_BASE_URL = "https://api.lede.tv.br/api"
```

Mídias e screenshots usam `PUBLIC_BASE_URL` (ex.: `https://api.lede.tv.br/uploads/...`).

## 7. Volumes e S3

| Volume | Conteúdo |
|--------|----------|
| `lede_postgres_data` | Banco |

Mídias e screenshots vão para o bucket S3 (`STORAGE_DRIVER=s3`).  
Garanta que o bucket permita leitura pública (ou URL assinada) para o Edge baixar os arquivos.

Backup periódico do Postgres; objetos ficam no provedor S3.

## 8. Troubleshooting

**Web chama API em localhost**  
`NEXT_PUBLIC_API_URL` é embutido no **build**. Altere a variável e faça **Rebuild** do serviço `web`.

**CORS bloqueado**  
Confira `CORS_ORIGIN` exatamente igual à origem do browser (com `https://`).

**API não sobe / migrate**  
Veja logs do `api`. `DATABASE_URL` é montada automaticamente a partir de `POSTGRES_*`.

**401 em /api/auth/me no healthcheck**  
É esperado sem token; o healthcheck trata 401 como saudável.

**Seed de demo completo (condomínio, layouts)**  
O seed de produção cria só o admin. Para dados demo, rode localmente `npm run prisma:seed` e/ou cadastre pelo Cloud Ops.

## Comandos úteis (servidor)

```bash
# logs
docker compose -f docker-compose.dokploy.yml logs -f api

# shell na API
docker compose -f docker-compose.dokploy.yml exec api sh
```
