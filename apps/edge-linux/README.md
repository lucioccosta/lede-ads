# LEDE Edge Linux (SB3000 + Arch Linux ARM no SD)

Player kiosk equivalente ao `apps/edge-android`, para rodar o SB3000 com
Arch Linux ARM no cartão SD. Motivo principal: o dongle **AsiaRF AWHUSB-001
(HaLow, USB `3905:a020`)** é uma NIC **CDC-NCM** e funciona nativamente no
Linux (`enu*`), mas não no Android 10 do box.

Mesmo protocolo da API Edge (`register`, `sync`, `heartbeat`/comandos,
`proof-of-play`, `ticker`, `screenshot-upload`), com `appFlavor=linux`
(target de OTA `sb3000-linux`).

> Guia operacional (imagem do SD, primeiro boot, auto-registro, diagnóstico):
> [`docs/EDGE_LINUX.md`](../../docs/EDGE_LINUX.md).

## Estrutura

```
lede_edge/              # app (Python) — vai no pacote OTA
  __main__.py           # entrada: GTK primeiro, GStreamer depois do 1º quadro
  controller.py         # laços (heartbeat/sync/ticker/screenshot), comandos, auto-registro
  api.py · store.py · media_cache.py · telemetry.py · identity.py
  updater.py            # OTA lado a lado + confirmação de saúde
  video.py              # GStreamer; HW (cedrus) só em dimensões seguras
  ui.py                 # GTK4: splash, registro, zonas, Stories, tarja, rotação
packaging/
  build-release.sh      # → releases/edge/sb3000-linux/lede-edge-sb3000-linux-vX.Y.Z.tar.zst
  install.sh            # prepara um box manualmente
  system/               # arquivos de sistema (imagem): launch, session, splash,
                        # firstboot, units systemd, networkd, watchdog, modules-load
  image/                # build da imagem do SD a partir da MiniArch (x86, sem root)
    build-image.sh · ext4-extract.py · apply-packages.py · make-splash.sh
tests/                  # núcleo, OTA/rollback, registro (sem GTK)
tools/                  # mock_api.py (API simulada), spike_play.py (benchmark de vídeo)
```

## Pilha

| Camada | Escolha | Por quê |
|---|---|---|
| Compositor | `cage` (Wayland kiosk) + `seatd` | Uma app em tela cheia, sem desktop |
| UI | GTK4 (PyGObject) | Zonas, Stories, tarja, rotação |
| Vídeo | GStreamer `uridecodebin3` + `gtk4paintablesink`, decoders `v4l2sl*` (cedrus) | Medido: H.264 1080p30 **0 quadros perdidos, ~14% CPU**; em software perde ~10% |
| Núcleo | Python stdlib (`api`, `store`, `media_cache`, `updater`, `telemetry`, `identity`) | Sem dependências externas; testável sem GPU |
| Boot | `lede-splash` (framebuffer) → `cage` + `imv` → app (logo idêntico) | Logo da LEDE do início do systemd até o conteúdo |

## Paridade com o Android

| Android | Linux |
|---|---|
| `PlayerActivity` loops (heartbeat 30 s, sync 60 s, ticker 60 s, screenshot 120 s) | `controller.py` (threads, mesmos intervalos) |
| `ZoneComposer` (escala do layout, reserva 36/1080 da tarja) | `ui.ZoneArea` (mesma matemática) |
| `CondoStoriesView` | `ui.StoriesView` (persiste entre cenas pelo fingerprint) |
| `MediaCache`, `ManifestStore`, `ProofOfPlayQueue` | `media_cache.py`, `store.py` (escrita atômica) |
| OTA `PackageInstaller` (exige Device Owner) | `updater.py` — releases lado a lado + rollback automático |
| `reboot` (exige Device Owner) | `systemctl reboot` |
| Fuso do Cloud | `timedatectl set-timezone` + relógio da tarja |
| Screenshot `PixelCopy` | `grim` (wlr-screencopy do cage) |
| Orientação | `ui.RotatedBin` (0/90/180/270) |
| Pairing por código | **Auto-registro**: TV mostra logo + código; LEDE aceita no Cloud (`/edge/register`) |
| Re-parear: Volume− ×10 em 5 s | Igual (teclado/controle IR) → volta ao auto-registro |
| Sem rede | Tenta para sempre (registro: backoff 5 s → 60 s; sync/heartbeat seguem do cache) |
| Resolução HDMI 1280×720 | `output_mode` no `edge.conf` (aplicado via `wlr-randr`) |
| Boot / kiosk | `lede-edge.service` (systemd, `Restart=always`, watchdog) |

## OTA e rollback

```
/opt/lede-edge/releases/X.Y.Z/   VERSION + lede_edge/
/opt/lede-edge/current  → releases/X.Y.Z
/opt/lede-edge/previous → releases/anterior
/var/lib/lede-edge/ota/pending.json, attempts
```

1. Cloud envia `update` com a URL de `lede-edge-sb3000-linux-vX.Y.Z.tar.zst`.
2. Edge baixa, extrai (filtro `data`, sem path traversal), confere `VERSION`,
   troca `current` atomicamente, grava `pending.json`, ACK `done` e reinicia.
3. O **lançador** (`/usr/lib/lede-edge/launch`, parte da imagem — não é trocado
   pela OTA) conta os starts; se a versão nova não confirmar saúde
   (heartbeat + sync OK) em 3 starts, volta para `previous`.

## Desenvolvimento

```bash
python3 -m unittest discover -s tests -v      # núcleo + lançador (sem GTK)
./packaging/build-release.sh                  # → releases/edge/sb3000-linux/*.tar.zst
python3 tools/mock_api.py --media-dir DIR     # API Edge simulada (inclui comandos/OTA)
cage -- python3 tools/spike_play.py video.mp4 hw   # benchmark de vídeo no box
```

## Imagem do SD

```bash
SSH="ssh root@<box-de-referência>" packaging/image/build-image.sh \
  --base ~/MiniArch-15.4.0-...-h313.x96_q_lpddr3-SD-Image.img.xz \
  --package ../../releases/edge/sb3000-linux/lede-edge-sb3000-linux-vX.Y.Z.tar.zst \
  --out ../../releases/edge/sb3000-linux --root-hash "$(openssl passwd -6)"
```

Detalhes (etapas, primeiro boot, requisitos): [`docs/EDGE_LINUX.md`](../../docs/EDGE_LINUX.md#gerar-a-imagem).

## Instalar num box (sem imagem)

```bash
scp -r packaging lede-edge-sb3000-linux-vX.Y.Z.tar.zst root@BOX:/root/edge/
ssh root@BOX /root/edge/packaging/install.sh /root/edge/lede-edge-sb3000-linux-vX.Y.Z.tar.zst
reboot   # na 1ª vez, para aplicar cma=256M
```

Requisitos do box (verificados no SB3000 de teste):
- Kernel com `sunxi_cedrus`, `panfrost`, `cdc_ncm` (MiniMyth2 7.3.1 — **pinado
  em `IgnorePkg`**, nunca atualizar via pacman).
- `cma=256M` no `extlinux.conf` — com os 32 MB padrão o CMA fica 100% ocupado
  e o decoder de hardware sofre. O `install.sh` adiciona.
- Rootfs expandida para o cartão inteiro.

## Publicar versão

1. Suba `apps/edge-linux/VERSION` e faça commit.
2. `git tag edge-sb3000-linux-vX.Y.Z && git push origin edge-sb3000-linux-vX.Y.Z`
   (ou Actions → **Edge SB3000 Linux Release**).
3. Em **Telas**, boxes Linux desatualizados mostram **Atualizar**.

## Vídeo: limitação do decoder de hardware

O driver `cedrus` (staging, kernel 7.3 no H313) só decodifica corretamente
quando **largura % 32 == 0 e altura % 16 == 0** (medido em 27 resoluções). Fora
disso: cores lavadas, riscos coloridos e lixo na última linha.

- **Cloud:** todo upload de vídeo é normalizado para dimensões seguras
  (escala para cima, ≤ ~2%). Vídeos antigos: `node dist/src/scripts/normalize-videos.js --dry-run`
  e depois sem `--dry-run`, no container da API.
- **Edge:** cada vídeo é inspecionado; tamanho inseguro → decodifica em
  software (correto, mais CPU). Nunca mostra imagem corrompida.
