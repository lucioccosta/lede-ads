# LEDE Ads — Sinalização Digital

Plataforma **Cloud + Edge** para propagandas em TVs e telas LED (elevadores, lobbies, etc.).

- **Cloud Ops (LEDE):** operação completa — clientes, planos, layouts, mídias, cenas, agendas, telas e monitoramento  
- **Portal do cliente:** envio/aprovação de criativos, amostragem e histórico  
- **Portal do condomínio:** troca do aviso na área exclusiva da tela (sem editar cenas/agendas)  
- **Edge Android:** player kiosk com sync, cache offline e proof-of-play  

## Estrutura

```
apps/
  cloud-web/      # Next.js — dashboard LEDE + portal cliente/condomínio (shadcn/ui)
  cloud-api/      # NestJS + Prisma + PostgreSQL
  edge-android/   # Player Android 11+ (Kotlin, ExoPlayer)
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

Arquivos enviados ficam em `apps/cloud-api/uploads/` (gitignored) e são servidos em `/uploads/…`.

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

- Clientes (flag **é condomínio**), planos, tipos de tela, layouts  
- Mídias, cenas, agendamentos (canais `full` / `condo` / `ads`)  
- Telas / monitoramento (heartbeat, screenshot, re-sync, reboot)  
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
| `Device.orientation` | `landscape` \| `portrait` |
| `Device.clientId` | Vincula a tela ao condomínio |

No Edge, agendas `condo` e `ads` do mesmo device são mescladas na playlist (área exclusiva + anúncios).

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
| Mídias / uploads | CRUD mídia, review, `POST /uploads` |
| Cenas / agendas | CRUD LEDE; portal condo: `GET /scenes/condo/active` + `PATCH` só zonas condo |
| Devices | pairing, monitoring, comandos, `GET /devices/mine` |
| Edge | `/edge/pair`, `/edge/sync`, heartbeat, PoP, screenshot |
| Relatórios | `GET /reports/sampling` |
| Histórico | `GET /history` |

**Contexto LEDE em espaço de cliente:** enviar header  
`X-Client-Context: <clientId>` (o Cloud Web faz isso automaticamente ao trocar o espaço).

---

## Edge Android

1. Abra `apps/edge-android` no Android Studio.  
2. Ajuste `API_BASE_URL` em `app/build.gradle.kts`:  
   - Emulador AVD: `http://10.0.2.2:3001/api`  
   - Device na mesma Wi‑Fi: `http://<IP-DO-HOST>:3001/api`  
3. Rode em Android 11+.  
4. Pareie com o código gerado em Cloud Ops → Telas.

### Offline e kiosk

- Mídias baixadas para `filesDir/media/{checksum}`; playlist via `file://`  
- Sem rede: último manifest em cache  
- PoP falho enfileirado (`pop_queue.json`) e reenviado no heartbeat/sync  
- Modo imersivo + `startLockTask()`  

#### Device Owner (opcional)

```bash
adb shell dpm set-device-owner com.lede.edge/.LedeDeviceAdminReceiver
```

Habilita reboot remoto via DPM. Sem Device Owner, o kiosk imersivo continua; o comando Reiniciar pode falhar.

#### Comandos remotos

Em **Telas**: Re-sync / Screenshot / Reiniciar — entregues no próximo heartbeat (~30s).

---

## Capacidades atuais

- [x] Clientes, planos, tipos de tela, layouts multi-zona  
- [x] Mídias (upload, aprovação), cenas e agendamentos por canal  
- [x] Flag condomínio + portal simplificado (só aviso ativo)  
- [x] Espaço LEDE ↔ portal do cliente no sidebar  
- [x] Histórico de modificações (portal + dashboard)  
- [x] Troca de senha pelo próprio usuário  
- [x] Edge: pairing, sync split, offline, PoP, heartbeat, screenshot, kiosk  
- [x] Monitoramento online/offline  

## Próximos passos sugeridos

- Validação em device físico (elevador split + cota PoP)  
- Deploy (API, web, Postgres) e mídias em S3/CDN  
- Notificações de mídia pendente  
- Harden de secrets e Device Owner em frota  

---

## Scripts úteis (raiz)

```bash
npm run dev:web    # Next.js
npm run dev:api    # Nest watch
npm run docker:up  # Postgres (compose)
```

Seed / migrate (API):

```bash
cd apps/cloud-api
npx prisma migrate dev
npm run prisma:seed
```
