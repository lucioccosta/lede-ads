# Edge Linux — guia operacional

Player kiosk da LEDE rodando **Arch Linux ARM no cartão SD** do Proeletronic
SB3000 (clone do X96-Q, SoC Allwinner **H313**). Mesmo protocolo e mesmas
funções do app Android ([`docs/EDGE.md`](EDGE.md)), com `appFlavor=linux`.

**Por que Linux:** o dongle HaLow **AsiaRF AWHUSB-001** (USB `3905:a020`,
"HaLowFly") é uma placa de rede **CDC-NCM** — o rádio HaLow roda no firmware do
dongle. O kernel do Android 10 do box não traz `cdc_ncm`; no Linux ele aparece
como `enu1` e pega DHCP sozinho.

Código: [`apps/edge-linux`](../apps/edge-linux) · README técnico:
[`apps/edge-linux/README.md`](../apps/edge-linux/README.md).

---

## Visão geral

| Camada | Escolha |
|---|---|
| SO | MiniArch 15.4.0 (Arch Linux ARM aarch64), kernel MiniMyth2 **7.3.1** (pinado em `IgnorePkg`) |
| Boot | U-Boot no SD → `extlinux.conf` (sem initramfs) |
| Compositor | `cage` (Wayland kiosk) + `seatd` |
| Player | Python 3 + GTK4 (PyGObject) + GStreamer (`uridecodebin3` → `gtk4paintablesink`) |
| Vídeo | Decoder de hardware `cedrus` (`v4l2sl*dec`) — H.264 1080p30 com 0 quadros perdidos e ~14% de CPU |
| Rede | `systemd-networkd`: cabo (`end*`, métrica 100) tem prioridade; HaLow (`enu*`, métrica 600) assume sem cabo |
| Resolução | 1280×720 (igual ao Android), desde o kernel (`video=`) |

Funções (iguais ao Android): auto-registro, sync de cenas (zonas, Stories do
condomínio, rodízio de anúncios), tarja de índices, proof-of-play com fila
offline, heartbeat + telemetria, comandos remotos (re-sync, screenshot,
reboot, update), fuso do Cloud, orientação 0/90/180/270, OTA com rollback.

---

## Imagem do SD (instalação em campo)

Artefato: `lede-edge-sb3000-linux-vX.Y.Z.img.xz` (~430 MB; 3,5 GB descompactada,
cabe em cartões ≥ 4 GB). Não vai para o Git (está no `.gitignore`).

### Gravar

1. Grave o `.img.xz` num cartão SD com o **balenaEtcher** (aceita `.xz`) ou
   `xz -dc arquivo.img.xz | sudo dd of=/dev/sdX bs=4M conv=fsync`.
2. Coloque o cartão no SB3000 e ligue. O box dá boot pelo SD (o Android da
   eMMC fica intacto; sem o cartão ele volta a ser Android).

### Primeiro boot (uma vez por box, mais demorado)

`lede-firstboot.service` executa `/usr/lib/lede-edge/firstboot`:

1. pós-instalação dos pacotes (equivale aos hooks ARM do pacman, que não rodam
   no build x86): `systemd-sysusers`, `ldconfig`, `update-ca-trust`, caches de
   GTK/gdk-pixbuf/GIO, fontconfig, MIME, hwdb;
2. expande a partição raiz até o fim do cartão;
3. hostname `lede-<código>` — o mesmo código mostrado na TV e no Cloud;
4. compila o bytecode Python do app com o Python do box;
5. gera chaves SSH próprias do box.

Depois aparece o **logo + código** na TV → aceitar no Cloud (abaixo).

### Acesso SSH

Usuário `root`, senha definida no build da imagem (hash SHA-512 na imagem; a
senha em texto não fica no repositório nem em arquivo). Guarde-a no cofre de
senhas da equipe. Para trocar num box: `passwd`. Para trocar em todas as
próximas gravações: gerar a imagem de novo com outro `--root-hash`.

---

## Auto-registro (sem código de pairing)

1. Box sem token se apresenta em `POST /edge/register` com `hardwareId` = SID
   do SoC (`sid-…`, único por chip, estável mesmo com SD clonado) e um segredo
   próprio (`/var/lib/lede-edge/registration.json`).
2. A TV mostra **só o logo e o código** (6 caracteres, calculado localmente —
   aparece sem rede).
3. Cloud → **Telas → Aguardando aprovação** → confira o código → **Aceitar**
   (nome, condomínio, grupo, tipo de tela, orientação) ou **Recusar**.
4. O box consulta `GET /edge/register/status` a cada 10 s; aceito → recebe o
   token e começa a tocar.

- **Sem rede / Cloud fora:** tenta para sempre, backoff 5 s → 60 s.
- **Re-parear** ou excluir a tela no Cloud → volta para "Aguardando aprovação".
- **Chave de cadastro (recomendado em produção):** `EDGE_ENROLLMENT_KEY` na API
  + `enrollment_key` no `edge.conf` (ou `--enrollment-key` no build da imagem).
- **Re-parear no box:** Volume− ×10 em 5 s (teclado/controle IR).

---

## Boot e splash

| Etapa | Tela |
|---|---|
| U-Boot + kernel (`quiet`, sem cursor) | preto |
| `lede-splash.service` (logo no `/dev/fb0`, 1º serviço do systemd) | **logo** |
| `cage` assume o HDMI | preto por alguns segundos |
| `imv` (sessão) / janela do app (mesma composição) | **logo** |
| Player | código de registro ou conteúdo |

- O splash respeita a orientação salva do box (TV vertical já mostra o logo
  em pé). Imagens pré-renderizadas em `/usr/share/lede-edge/splash/`.
- O player sobe cedo (não espera rede nem `basic.target`); GStreamer e a troca
  para 1280×720 rodam depois do primeiro quadro.
- Watchdog de hardware (`sunxi-wdt`, 15 s): kernel travado → reinício sozinho.
  Watchdog do serviço (180 s): app travado → systemd reinicia.

---

## Vídeo: limitação do decoder de hardware

O driver `cedrus` (staging, kernel 7.3) só decodifica corretamente quando
**largura % 32 == 0 e altura % 16 == 0** (medido em 27 resoluções). Fora disso:
cores lavadas, riscos coloridos e lixo na última linha. 1920×1080, 1080×1920 e
720×1280 caem no caso ruim.

- **Cloud:** todo upload de vídeo é normalizado (escala para cima, ≤ ~2%, ex.
  1080×1920 → 1088×1920), sem áudio. Vídeos antigos:
  `node dist/src/scripts/normalize-videos.js --dry-run` e depois sem
  `--dry-run`, no container da API.
- **Edge:** cada vídeo é inspecionado; tamanho inseguro → decodificação em
  software (correta, mais CPU). Log: `Vídeo WxH → decoder HW|software`.
- **CMA:** `cma=256M` no `extlinux.conf` (o padrão de 32 MB fica 100% ocupado).

---

## OTA e rollback

```
/opt/lede-edge/releases/X.Y.Z/   VERSION + lede_edge/
/opt/lede-edge/current  → releases/X.Y.Z
/opt/lede-edge/previous → releases/anterior
/var/lib/lede-edge/ota/pending.json, attempts, last-rollback.json
```

1. Cloud → Telas → **Atualizar** envia `update` com o pacote
   `lede-edge-sb3000-linux-vX.Y.Z.tar.zst` (GitHub Releases, target `sb3000-linux`).
2. Edge baixa, extrai (sem path traversal), confere `VERSION`, troca `current`
   atomicamente, ACK `done` e reinicia.
3. O lançador (`/usr/lib/lede-edge/launch`, da imagem — não muda na OTA) volta
   para `previous` se a versão nova não fizer heartbeat + sync em 3 inícios.

Só o app é atualizado pela OTA; kernel/sistema mudam com uma imagem nova.

---

## Configuração (`/etc/lede-edge/edge.conf`)

```ini
[edge]
api_base_url = https://api.lede.tv.br/api
flavor = linux
state_dir = /var/lib/lede-edge
install_root = /opt/lede-edge
output_mode = 1280x720        # vazio = modo preferido do monitor
# enrollment_key = ...        # igual a EDGE_ENROLLMENT_KEY da API
```

Fica na imagem e não é trocado pela OTA. Após editar: `systemctl restart lede-edge`.

---

## Diagnóstico

```bash
ssh root@<ip>                         # hostname lede-<código>
journalctl -u lede-edge -f            # player (registro, sync, vídeo, comandos)
journalctl -u lede-firstboot          # primeiro boot
systemctl restart lede-edge           # reinicia o player
cat /var/lib/lede-edge/ota/last-rollback.json   # houve rollback de OTA?
networkctl                            # end0 (cabo) / enu1 (HaLow)
```

Screenshot manual (dentro da sessão): o Cloud tem o botão **Screenshot**.

---

## Gerar a imagem

Roda na **máquina de build** (x86, sem root): `fakeroot` + `debugfs` +
`mke2fs -d` + `mtools`. Nada é executado no box de referência — dele só se leem
os pacotes Arch ARM que faltam na MiniArch (cache do pacman, já verificados) e
as entradas do banco do pacman.

```bash
# 1. pacote do app
apps/edge-linux/packaging/build-release.sh

# 2. hash da senha root (não salve a senha em arquivo)
openssl passwd -6        # digite a senha

# 3. imagem
SSH="ssh root@<box-de-referência>" \
apps/edge-linux/packaging/image/build-image.sh \
  --base ~/MiniArch-15.4.0-05.08.2026-7.3.1-board-h313.x96_q_lpddr3-SD-Image.img.xz \
  --package releases/edge/sb3000-linux/lede-edge-sb3000-linux-v0.1.0.tar.zst \
  --out releases/edge/sb3000-linux \
  --root-hash '<hash $6$...>' \
  [--enrollment-key <chave>] [--pkg-cache <dir>] [--offline]
```

**Cache de pacotes:** fica em `releases/edge/sb3000-linux/pkgcache/` (fora do
git; outro lugar com `--pkg-cache`): `pkgs/` (`.pkg.tar.*`), `localdb/` (banco
do pacman) e `ref-pkgs.txt` (`pacman -Q` do box de referência). Um build online
preenche o cache; com `--offline` o box não é acessado e tudo vem dele (o build
falha listando o que faltar). Para copiar o cache inteiro do box de uma vez:

```bash
C=releases/edge/sb3000-linux/pkgcache; mkdir -p $C/pkgs $C/localdb
ssh root@BOX 'cd /var/cache/pacman/pkg && tar -cf - .' | tar -C $C/pkgs -xf -
ssh root@BOX 'cd /var/lib/pacman/local && tar -cf - --exclude=ALPM_DB_VERSION .' | tar -C $C/localdb -xf -
ssh root@BOX 'pacman -Q' | sort > $C/ref-pkgs.txt
```

Etapas: MiniArch → extrai rootfs (preservando setuid/setgid) → aplica os
pacotes (regras de `.pacnew` do pacman, mantém `IgnorePkg` do kernel) → LEDE
Edge, serviços, splash, senha, `edge.conf` de produção → `extlinux.conf`
(720p, quiet, CMA) → ext4 → `.img.xz` + `.sha256`.

Requisitos locais: `fakeroot`, `debugfs`/`mke2fs` ≥ 1.47, `sfdisk`, `mtools`,
`zstd`, `xz`, `ffmpeg`, `systemctl`, `python3`.

**Box de referência:** SB3000 com a MiniArch + `packaging/install.sh` aplicado
(é de lá que vem a lista e os arquivos de pacotes). Não limpe o cache do pacman
dele (`pacman -Scc`) antes de preencher o cache local; depois dele, use `--offline`.

---

## Preparar um box manualmente (sem imagem)

```bash
scp -r apps/edge-linux/packaging releases/edge/sb3000-linux/lede-edge-sb3000-linux-vX.Y.Z.tar.zst root@BOX:/root/edge/
ssh root@BOX /root/edge/packaging/install.sh /root/edge/lede-edge-sb3000-linux-vX.Y.Z.tar.zst
reboot
```

Pré-requisitos: MiniArch no SD, raiz expandida, `pacman-key --init && pacman-key --populate`.

---

## Publicar versão do app (OTA)

1. Suba `apps/edge-linux/VERSION` e faça commit.
2. `git tag edge-sb3000-linux-vX.Y.Z && git push origin edge-sb3000-linux-vX.Y.Z`
   (ou Actions → **Edge SB3000 Linux Release**).
3. Em **Telas**, boxes Linux desatualizados mostram **Atualizar**.
