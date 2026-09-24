# LEDE Ads — Sinalização Digital

Plataforma **Cloud + Edge** para propagandas em TVs e telas LED (elevadores, lobbies, etc.).

- **Cloud Ops (LEDE):** operação completa — clientes, planos, grupos de telas, capacidade, layouts, mídias, cenas, agendas, telas e monitoramento  
- **Portal do cliente:** envio/aprovação de criativos, amostragem e histórico  
- **Portal do condomínio:** troca do aviso na área exclusiva da tela (sem editar cenas/agendas)  
- **Edge Android:** player kiosk com sync, cache offline e proof-of-play  

## Estrutura

```
apps/
  cloud-web/      # Next.js — dashboard LEDE + portal cliente/condomínio (shadcn/ui)
  cloud-api/      # NestJS + Prisma + PostgreSQL
  edge-android/   # Player Android 10+ (Kotlin, ExoPlayer) — sideload por tipo de box
releases/
  edge/           # Docs + artefatos por dispositivo (APKs no GitHub Releases)
packages/
  shared-types/   # Contratos TypeScript compartilhados
```

Monorepo npm workspaces (`package.json` na raiz).

## Pré-requisitos

- Node.js 20+
- PostgreSQL (local ou Docker)
- Android Studio (para o Edge)

## Subir ambiente

```bash
# Na raiz do repositório
npm install

# Postgres (opcional via Docker)
docker compose up -d

# API
cd apps/cloud-api
cp .env.example .env   # ajuste PUBLIC_BASE_URL / DATABASE_URL
npx prisma migrate dev
npm run prisma:seed
npm run start:dev

# Web (outro terminal)
cd apps/cloud-web
npm run dev
# ou na raiz: npm run dev:web / npm run dev:api
```

| Serviço   | URL |
|-----------|-----|
| Cloud Web | http://localhost:3000 |
| API       | http://localhost:3001/api |

### Storage (S3 / Eveo)

Mídias e screenshots usam o driver configurável:

| Variável | Exemplo |
|----------|---------|
| `STORAGE_DRIVER` | `s3` (padrão em prod) ou `local` |
| `S3_ENDPOINT` | `https://object.sp2.eveo.com.br` |
| `S3_BUCKET` | `lede-arquivos` |
| `S3_TENANT` | `48806696000174` |
| `S3_PUBLIC_URL` | `https://object.sp2.eveo.com.br/48806696000174:lede-arquivos` |
| `S3_FORCE_PATH_STYLE` | `true` |

URL pública de um objeto:  
`{S3_PUBLIC_URL}/media/...` ou `/screenshots/...`  

Credenciais (`S3_ACCESS_KEY` / `S3_SECRET_KEY`) só em `.env` / Dokploy — nunca no Git.  
Fallback: `STORAGE_DRIVER=local` → pasta `apps/cloud-api/uploads/`.  
Detalhes: [docs/STORAGE.md](docs/STORAGE.md) · Inventário ads: [docs/CAPACITY.md](docs/CAPACITY.md).

### Logins demo (após seed)

| Usuário | Senha | Papel |
|---------|-------|-------|
| `admin@lede.com` | `admin123` | LEDE admin (Cloud Ops) |
| `cliente@demo.com` | `cliente123` | Portal cliente (anunciante) |
| `condo@demo.com` | `condo123` | Portal condomínio |

Pairing Edge demo:

| Device | Código |
|--------|--------|
| TV Lobby | `ABC123` |
| Elevador Demo | `ELV001` |

---

## Papéis e espaços

### Cloud Ops (LEDE)

Usuários `lede_admin` / `lede_operator` acessam `/dashboard`:

- Clientes (flag **é condomínio**), planos, **grupos de telas**, **capacidade**  
- Tipos de tela, layouts  
- Mídias, cenas, agendamentos (canais `full` / `condo` / `ads`)  
- Telas / monitoramento (heartbeat, screenshot, re-sync, reboot, re-parear)  
- Amostragem (proof-of-play)  
- Histórico global de alterações (filtro por cliente)  

**Troca de espaço:** no ícone superior do sidebar, o admin pode entrar no **espaço de qualquer cliente**. A UI e as APIs passam a se comportar como o portal daquele cliente (header `X-Client-Context`). Para voltar, escolha **LEDE / Cloud Ops**.

### Portal — cliente anunciante (`isCondo = false`)

- Enviar criativos (imagem/vídeo)  
- Aprovar / rejeitar mídias pendentes  
- Histórico e amostragem  

### Portal — condomínio (`isCondo = true`)

- **Meu aviso:** só troca a imagem da cena ativa no canal `condo` (pode reutilizar mídias da biblioteca)  
- **Minhas telas:** devices vinculados  
- Mídias, histórico e amostragem  
- **Não** cria/edita cenas nem agendamentos (isso fica com a LEDE)  

Cada usuário pode **alterar a própria senha** no menu da conta (sidebar).

---

## Modelo de telas (condo split)

| Conceito | Descrição |
|----------|-----------|
| `ScreenType` | `standard` (tela cheia) ou `condo_split` (zona condomínio + zona ads) |
| `ClientScreenType` | Tipos de tela liberados para o cliente/condomínio |
| `Layout.zonesJson` | Zonas com `role`: `full` \| `condo` \| `ads` |
| `Schedule.channel` | `full` \| `condo` \| `ads` |
| `Device.orientation` | `landscape` \| `portrait` \| `*_reverse` |
| `Device.clientId` | Vincula a tela ao condomínio |
| `Device.groupId` | Vincula a tela a um **grupo** (inventário de ads) |
| `DeviceGroup` | Telas de um condomínio; base da capacidade e agendas ads |
| `Plan.months` + grupos | Produto comercial `10s × amostragens/dia × meses` |

No Edge (`condo_split`), a playlist mescla zona condo + rodízio igual entre anúncios do grupo; slots não vendidos usam a cena house **“Anuncie AQUI”**.

Detalhes: [docs/CAPACITY.md](docs/CAPACITY.md).

---

## Histórico de alterações

Tabela `ChangeLog` registra:

- `condo_media_changed` — aviso atualizado na tela  
- `media_uploaded` — upload de mídia  
- `media_reviewed` — aprovação/rejeição  

Visível em **Portal → Histórico** e **Dashboard → Rede → Histórico**.

---

## API (visão geral)

Prefixo global: `/api`.

| Área | Endpoints principais |
|------|----------------------|
| Auth | `POST /auth/login`, `GET /auth/me`, `PATCH /auth/password` |
| Clientes / usuários | CRUD clientes; usuários do portal por cliente |
| Grupos / capacidade | CRUD `/device-groups`; `GET /capacity` |
| Planos | CRUD com `months` + `groupIds` (valida overbook) |
| Mídias / uploads | CRUD mídia, review, `POST /uploads` |
| Cenas / agendas | CRUD LEDE; portal condo: `GET /scenes/condo/active` + `PATCH` só zonas condo; agendas ads por `groupId` |
| Devices | pairing, monitoring, comandos, re-parear, `GET /devices/mine` |
| Edge | `/edge/pair`, `/edge/sync` (RR multi-ads + house), heartbeat, PoP, screenshot |
| Relatórios | `GET /reports/sampling` |
| Histórico | `GET /history` |

**Contexto LEDE em espaço de cliente:** enviar header  
`X-Client-Context: <clientId>` (o Cloud Web faz isso automaticamente ao trocar o espaço).

---

## Edge Android

Guia completo: [`docs/EDGE.md`](docs/EDGE.md)  
Artefatos: [`releases/edge/`](releases/edge/) — APK de produção nas [GitHub Releases](https://github.com/lucioccosta/lede-ads/releases).

| targetId | Pasta | Package | API | GitHub |
|----------|-------|---------|-----|--------|
| `sb3000` | [`sb3000`](releases/edge/sb3000/) | `com.lede.edge` | `https://api.lede.tv.br/api` | **Sim (OTA)** |
| `sb3000-fios` | [`sb3000-fios`](releases/edge/sb3000-fios/) | `com.lede.edge.fios` | LAN Fios | Não |
| `sb3000-casa` | [`sb3000-casa`](releases/edge/sb3000-casa/) | `com.lede.edge.casa` | LAN Casa | Não |

```bash
cd apps/edge-android
./gradlew exportSb3000Apk        # produção → GitHub
./gradlew exportSb3000FiosApk    # dev Fios (local)
./gradlew exportSb3000CasaApk    # dev Casa (local)
```

Após parear, o player entra em kiosk (Home + lock task).  
**Sair:** Volume+ segurado + Voltar ×3, ou Voltar ×7 → launcher Nova.  
Telemetria no heartbeat: CPU, RAM, disco, uptime — visível em **Telas**.
### Offline e kiosk

- Mídias baixadas para `filesDir/media/{checksum}`; playlist via `file://`  
- Sem rede: último manifest em cache  
- PoP falho enfileirado (`pop_queue.json`) e reenviado no heartbeat/sync  
- Modo imersivo + `startLockTask()`  

#### Device Owner (opcional)

```bash
adb shell dpm set-device-owner com.lede.edge.casa/com.lede.edge.LedeDeviceAdminReceiver
# prod: com.lede.edge/com.lede.edge.LedeDeviceAdminReceiver
```

Habilita reboot remoto via DPM. Sem Device Owner, o kiosk imersivo continua; o comando Reiniciar pode falhar.

#### Comandos remotos

Em **Telas**: Re-sync / Screenshot / Reiniciar — entregues no próximo heartbeat (~30s).

---

## Capacidades atuais

- [x] Clientes, planos, tipos de tela, layouts multi-zona  
- [x] **Grupos de telas** por condomínio + dashboard de **capacidade** (18h × 10s × N)  
- [x] Planos `10s × amostragens/dia × meses` com validação de overbook  
- [x] Rodízio igual multi-anunciante no elevador + fill **Anuncie AQUI**  
- [x] Mídias (upload, aprovação), cenas e agendamentos por canal / grupo  
- [x] Flag condomínio + portal simplificado (só aviso ativo)  
- [x] Espaço LEDE ↔ portal do cliente no sidebar  
- [x] Histórico de modificações (portal + dashboard)  
- [x] Troca de senha pelo próprio usuário  
- [x] Edge: pairing, sync split, offline, PoP, heartbeat, screenshot, kiosk, rotação 0/90/180/270  
- [x] Edge: telemetria CPU/RAM/disco/uptime + escape de kiosk (v0.3.2+)  
- [x] Edge: flavors Casa / Fios / Prod  
- [x] Monitoramento online/offline + re-parear  
- [x] Storage S3 (Eveo) + fallback local  
- [x] Docker / Dokploy (compose + Dockerfiles)  

## Deploy (Dokploy)

Stack pronta em Docker Compose:

| Arquivo | Uso |
|---------|-----|
| `docker-compose.dokploy.yml` | Postgres + API + Web |
| `docker/api.Dockerfile` / `docker/web.Dockerfile` | Imagens |
| `.env.dokploy.example` | Modelo de variáveis (inclui S3) |
| [docs/DOKPLOY.md](docs/DOKPLOY.md) | Guia completo |

Resumo: app **Compose** no Dokploy → path `docker-compose.dokploy.yml` → envs (API, CORS, S3) → domínios `web:3000` e `api:3001` → primeiro deploy com `RUN_SEED=true`.

## Próximos passos sugeridos

- Validação em device físico (elevador split + cota PoP + RR multi-ads)  
- Precificação/R$ e checkout de planos  
- Waitlist / notificação quando grupo lotado libera vaga  
- Harden de secrets e Device Owner em frota  

---

## Scripts úteis (raiz)

```bash
npm run dev:web              # Next.js
npm run dev:api              # Nest watch
npm run docker:up            # Postgres local (compose)
npm run docker:dokploy:build # Build das imagens de produção
```

Seed / migrate (API):

```bash
cd apps/cloud-api
npx prisma migrate dev
npm run prisma:seed
```
