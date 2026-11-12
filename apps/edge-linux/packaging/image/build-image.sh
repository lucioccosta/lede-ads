#!/bin/bash
# Gera a imagem de SD "LEDE Edge Linux" a partir da imagem oficial MiniArch.
#
# Roda na MÁQUINA DE BUILD (x86, sem root: fakeroot + debugfs + mke2fs -d +
# mtools). Nada é executado no box: dele só se LEEM os pacotes Arch ARM que
# faltam na MiniArch (cache do pacman, já verificados por assinatura) e as
# entradas do banco do pacman correspondentes.
#
#   SSH="ssh root@192.168.10.188" build-image.sh \
#       --base MiniArch-15.4.0-...-h313.x96_q_lpddr3-SD-Image.img.xz \
#       --package lede-edge-sb3000-linux-vX.Y.Z.tar.zst \
#       --out ./out --root-hash '$6$...'                  # openssl passwd -6
#       [--api https://api.lede.tv.br/api] [--enrollment-key KEY]
#       [--size-mib 3584] [--pkg-cache DIR] [--offline]
#
# Cache de pacotes (padrão: releases/edge/sb3000-linux/pkgcache, fora do git):
# guarda os .pkg.tar.*, as entradas do banco do pacman e a lista `pacman -Q` do
# box de referência (ref-pkgs.txt). Com --offline o box não é acessado: tudo
# vem do cache, que precisa ter sido preenchido por um build online antes.
#
# Etapas:
#   1. MiniArch → bootloader, partição BOOT (FAT) e rootfs (ext4 → diretório);
#   2. pacotes: aplica os que o box tem a mais/mais novos (cage, mesa, gtk4,
#      gstreamer, imv… + atualizações), com regras de .pacnew do pacman;
#   3. LEDE Edge, serviços, splash, senha, configuração de produção;
#   4. extlinux.conf (720p, quiet, cma), ext4 novo, .img e .img.xz.
# Scriptlets/hooks do pacman (ARM) rodam no 1º boot (usr/lib/lede-edge/firstboot).
set -euo pipefail

HERE="$(cd "$(dirname "$0")/.." && pwd)"     # packaging/
REPO="$(cd "$HERE/../../.." && pwd)"
IMGDIR="$HERE/image"
BASE="" PKG="" OUT="" ROOT_HASH="" ENROLL="" SIZE_MIB=3584 OFFLINE=0
PKG_CACHE="$REPO/releases/edge/sb3000-linux/pkgcache"
API="https://api.lede.tv.br/api"
SSH="${SSH:-ssh root@192.168.10.188}"
BOOT_START=32768 BOOT_SECTORS=1022360 ROOT_START=1056768   # layout da MiniArch
CMDLINE="root=/dev/mmcblk0p2 rw rootwait console=ttyS0,115200n8 quiet loglevel=3 consoleblank=0 vt.global_cursor_default=0 logo.nologo video=HDMI-A-1:1280x720@60 cma=256M fsck.mode=auto fsck.repair=yes"

while [ $# -gt 0 ]; do
  case "$1" in
    --base) BASE="$2"; shift 2 ;;
    --package) PKG="$2"; shift 2 ;;
    --out) OUT="$2"; shift 2 ;;
    --root-hash) ROOT_HASH="$2"; shift 2 ;;
    --api) API="$2"; shift 2 ;;
    --enrollment-key) ENROLL="$2"; shift 2 ;;
    --size-mib) SIZE_MIB="$2"; shift 2 ;;
    --pkg-cache) PKG_CACHE="$2"; shift 2 ;;
    --offline) OFFLINE=1; shift ;;
    *) echo "opção desconhecida: $1" >&2; exit 2 ;;
  esac
done
[ -f "$BASE" ] || { echo "--base (imagem MiniArch .img.xz) obrigatório" >&2; exit 2; }
[ -f "$PKG" ] || { echo "--package obrigatório" >&2; exit 2; }
[ -n "$OUT" ] || { echo "--out obrigatório" >&2; exit 2; }
case "$ROOT_HASH" in '$6$'*) ;; *) echo "--root-hash deve ser SHA-512 (\$6\$...)" >&2; exit 2 ;; esac
for bin in fakeroot debugfs mke2fs e2fsck sfdisk zstd xz ffmpeg systemctl mcopy mtype mdel python3; do
  command -v "$bin" >/dev/null || { echo "falta $bin na máquina de build" >&2; exit 1; }
done

VER="$(tar --zstd -xOf "$PKG" VERSION | tr -d '[:space:]')"
NAME="lede-edge-sb3000-linux-v${VER}"
mkdir -p "$OUT"; OUT="$(cd "$OUT" && pwd)"
PKG="$(cd "$(dirname "$PKG")" && pwd)/$(basename "$PKG")"
IMG="$OUT/$NAME.img"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/lede-img.XXXXXX")"
ROOTFS="$WORK/rootfs"
FAKE="$WORK/fakeroot.state"
trap 'rm -rf "$WORK"' EXIT
fr() { fakeroot -i "$FAKE" -s "$FAKE" -- "$@"; }   # sessão fakeroot persistente
: > "$FAKE"

echo "==> [1/6] MiniArch base: $(basename "$BASE")"
xz -T0 -dc "$BASE" > "$WORK/base.img"
sfdisk -d "$WORK/base.img" | grep -q "start= *$ROOT_START" || { echo "layout da MiniArch inesperado" >&2; exit 1; }
dd if="$WORK/base.img" of="$WORK/bootloader.bin" bs=1024 skip=8 count=$((16384 - 8)) status=none
head -c 16 "$WORK/bootloader.bin" | grep -q 'eGON.BT0' || { echo "bootloader não encontrado" >&2; exit 1; }
dd if="$WORK/base.img" of="$WORK/boot.vfat" bs=512 skip=$BOOT_START count=$BOOT_SECTORS status=none
dd if="$WORK/base.img" of="$WORK/base-root.ext4" bs=512 skip=$ROOT_START status=none
rm -f "$WORK/base.img"
fr python3 "$IMGDIR/ext4-extract.py" "$WORK/base-root.ext4" "$ROOTFS" >/dev/null 2>&1
rm -f "$WORK/base-root.ext4"
[ -d "$ROOTFS/var/lib/pacman/local" ] || { echo "rootfs da base inválido" >&2; exit 1; }

echo "==> [2/6] Pacotes (cage, mesa, gtk4, gstreamer, imv… + atualizações)"
mkdir -p "$PKG_CACHE/pkgs" "$PKG_CACHE/localdb"
CACHE="$(cd "$PKG_CACHE" && pwd)"
echo "   cache: $CACHE"
for d in "$ROOTFS"/var/lib/pacman/local/*/; do
  awk '/^%NAME%/{getline n} /^%VERSION%/{getline v} END{print n, v}' "$d/desc"
done | sort > "$WORK/base-pkgs.txt"
if [ "$OFFLINE" = 1 ]; then
  [ -s "$CACHE/ref-pkgs.txt" ] || { echo "--offline: $CACHE/ref-pkgs.txt não existe (rode um build online antes)" >&2; exit 1; }
  sort "$CACHE/ref-pkgs.txt" > "$WORK/ref-pkgs.txt"
else
  $SSH 'pacman -Q' | sort > "$WORK/ref-pkgs.txt"
  [ -s "$WORK/ref-pkgs.txt" ] || { echo "pacman -Q vazio no box de referência" >&2; exit 1; }
fi
python3 - "$WORK/base-pkgs.txt" "$WORK/ref-pkgs.txt" > "$WORK/delta.txt" <<'PY'
import sys
base = dict(l.split() for l in open(sys.argv[1]) if l.strip())
ref = dict(l.split() for l in open(sys.argv[2]) if l.strip())
gone = [p for p in base if p not in ref]
if gone:
    sys.exit(f"pacotes da base ausentes na referência: {gone}")
for p in sorted(ref):
    if base.get(p) != ref[p]:
        print(p, ref[p])
PY
echo "   $(wc -l < "$WORK/delta.txt") pacotes a aplicar"
# Busca só o que ainda não está no cache local
missing="$WORK/missing.txt"; : > "$missing"
while read -r n v; do
  ls "$CACHE/pkgs/$n-$v-"*.pkg.tar.* >/dev/null 2>&1 && [ -d "$CACHE/localdb/$n-$v" ] || echo "$n $v" >> "$missing"
done < "$WORK/delta.txt"
if [ -s "$missing" ] && [ "$OFFLINE" = 1 ]; then
  echo "--offline: faltam no cache:" >&2; sed 's/^/   /' "$missing" >&2; exit 1
fi
if [ -s "$missing" ]; then
  echo "   baixando $(wc -l < "$missing") do box de referência"
  $SSH 'cd /var/cache/pacman/pkg && while read n v; do ls $n-$v-*.pkg.tar.* 2>/dev/null | grep -v "\.sig$" | head -1; done | tar -cf - -T -' \
    < "$missing" | tar -C "$CACHE/pkgs" -xf -
  awk '{print $1"-"$2}' "$missing" | $SSH 'cd /var/lib/pacman/local && tar -cf - -T -' | tar -C "$CACHE/localdb" -xf -
fi
while read -r n v; do
  ls "$CACHE/pkgs/$n-$v-"*.pkg.tar.* >/dev/null 2>&1 && [ -d "$CACHE/localdb/$n-$v" ] \
    || { echo "pacote $n-$v não foi obtido" >&2; exit 1; }
done < "$WORK/delta.txt"
# Cache completo para este conjunto: grava a lista para builds --offline
[ "$OFFLINE" = 1 ] || cp "$WORK/ref-pkgs.txt" "$CACHE/ref-pkgs.txt"
mkdir -p "$WORK/apply/pkgs" "$WORK/apply/localdb"
while read -r n v; do
  ln -s "$(ls "$CACHE/pkgs/$n-$v-"*.pkg.tar.* | grep -v '\.sig$' | head -1)" "$WORK/apply/pkgs/"
  ln -s "$CACHE/localdb/$n-$v" "$WORK/apply/localdb/$n-$v"
done < "$WORK/delta.txt"
fr python3 "$IMGDIR/apply-packages.py" "$ROOTFS" "$WORK/apply/pkgs" "$WORK/apply/localdb" 2>&1 \
  | grep -v "Ignoring unknown extended header" | sed 's/^/   /'
# Força ldconfig/hwdb/catálogo/sysusers no 1º boot (ConditionNeedsUpdate)
rm -f "$ROOTFS/etc/.updated" "$ROOTFS/var/.updated"

echo "==> [3/6] Limpeza e senha root"
fr bash -euo pipefail -c '
  R="$1"; H="$2"
  : > "$R/etc/machine-id"; rm -f "$R/var/lib/dbus/machine-id"
  echo lede > "$R/etc/hostname"
  rm -f "$R"/etc/ssh/ssh_host_* "$R"/var/log/*.log "$R/var/log/btmp" "$R/var/log/wtmp" "$R/var/log/lastlog"
  rm -rf "$R"/var/log/journal/* "$R"/var/cache/pacman/pkg/* "$R"/root/.bash_history "$R"/root/.ssh
  mkdir -p "$R/var/lib/lede-edge/media" "$R/var/lib/lede-edge/ota"
  awk -v h="$H" "BEGIN{FS=OFS=\":\"} \$1==\"root\"{\$2=h} {print}" "$R/etc/shadow" > "$R/etc/shadow.new"
  cat "$R/etc/shadow.new" > "$R/etc/shadow"; rm -f "$R/etc/shadow.new"
' _ "$ROOTFS" "$ROOT_HASH"

echo "==> [4/6] LEDE Edge v$VER, serviços e splash"
fr bash -euo pipefail -c '
  R="$1"; P="$2"; S="$3"; V="$4"
  mkdir -p "$R/opt/lede-edge/releases/$V"
  tar --zstd -xf "$P" -C "$R/opt/lede-edge/releases/$V" --no-same-owner
  chown -R 0:0 "$R/opt/lede-edge"
  ln -sfn "releases/$V" "$R/opt/lede-edge/current"
  for f in launch splash session firstboot; do install -Dm755 -o 0 -g 0 "$S/usr/lib/lede-edge/$f" "$R/usr/lib/lede-edge/$f"; done
  for u in lede-edge.service lede-splash.service lede-firstboot.service; do
    install -Dm644 -o 0 -g 0 "$S/etc/systemd/system/$u" "$R/etc/systemd/system/$u"; done
  install -Dm644 -o 0 -g 0 "$S/etc/systemd/system/seatd.service.d/lede-early.conf" "$R/etc/systemd/system/seatd.service.d/lede-early.conf"
  install -Dm644 -o 0 -g 0 "$S/etc/systemd/system.conf.d/lede-watchdog.conf" "$R/etc/systemd/system.conf.d/lede-watchdog.conf"
  install -Dm644 -o 0 -g 0 "$S/etc/modules-load.d/lede-edge.conf" "$R/etc/modules-load.d/lede-edge.conf"
  install -Dm644 -o 0 -g 0 "$S/etc/ssh/sshd_config.d/10-lede.conf" "$R/etc/ssh/sshd_config.d/10-lede.conf"
  install -Dm644 -o 0 -g 0 "$S/etc/systemd/network/20-wired.network" "$R/etc/systemd/network/20-wired.network"
  install -Dm644 -o 0 -g 0 "$S/etc/systemd/network/30-halow.network" "$R/etc/systemd/network/30-halow.network"
' _ "$ROOTFS" "$PKG" "$HERE/system" "$VER"
cat > "$WORK/edge.conf" <<EOF
# Configuração do LEDE Edge Linux (fica na imagem; não é trocada pela OTA).
[edge]
api_base_url = $API
flavor = linux
state_dir = /var/lib/lede-edge
install_root = /opt/lede-edge
# Resolução HDMI (igual ao app Android). Vazio = modo preferido do monitor.
output_mode = 1280x720
EOF
[ -n "$ENROLL" ] && echo "enrollment_key = $ENROLL" >> "$WORK/edge.conf"
fr bash -c 'install -Dm600 -o 0 -g 0 "$1" "$2/etc/lede-edge/edge.conf" && touch "$2/etc/lede-edge/firstboot"' _ "$WORK/edge.conf" "$ROOTFS"
"$IMGDIR/make-splash.sh" "$ROOTFS/opt/lede-edge/current/lede_edge/assets/lede_logo.png" "$WORK/splash" >/dev/null
fr bash -c 'mkdir -p "$2" && cp "$1"/* "$2"/ && chown -R 0:0 "$2"' _ "$WORK/splash" "$ROOTFS/usr/share/lede-edge/splash"
fr systemctl --root="$ROOTFS" enable systemd-networkd.service systemd-resolved.service \
  seatd.service sshd.service lede-splash.service lede-firstboot.service lede-edge.service >/dev/null 2>&1
fr systemctl --root="$ROOTFS" mask getty@tty1.service >/dev/null 2>&1 || true

echo "==> [5/6] Conferência"
fail() { echo "ERRO: $*" >&2; exit 1; }
[ ! -s "$ROOTFS/etc/machine-id" ] || fail "machine-id não vazio"
ls "$ROOTFS"/etc/ssh/ssh_host_* >/dev/null 2>&1 && fail "chaves SSH na imagem"
for f in device.json registration.json manifest.json; do
  [ ! -e "$ROOTFS/var/lib/lede-edge/$f" ] || fail "$f na imagem"; done
for b in cage imv python3 grim wlr-randr seatd; do [ -x "$ROOTFS/usr/bin/$b" ] || fail "falta /usr/bin/$b"; done
[ -e "$ROOTFS/usr/lib/libgtk-4.so.1" ] || fail "falta GTK4"
[ -e "$ROOTFS/usr/lib/gstreamer-1.0/libgstv4l2codecs.so" ] || fail "falta v4l2codecs"
[ -e "$ROOTFS/usr/lib/gstreamer-1.0/libgstgtk4.so" ] || fail "falta gtk4paintablesink"
[ -L "$ROOTFS/etc/systemd/system/multi-user.target.wants/lede-edge.service" ] || fail "lede-edge não habilitado"
fr stat -c '%a %U' "$ROOTFS/usr/bin/unix_chkpwd" | grep -q '^6755 root' || fail "setuid perdido (unix_chkpwd)"
grep -q '^PermitRootLogin yes' "$ROOTFS/etc/ssh/sshd_config.d/10-lede.conf" || fail "sshd sem login root por senha"
grep -q 'IgnorePkg *= *linux-aarch64' "$ROOTFS/etc/pacman.conf" || fail "kernel não está em IgnorePkg"
du -sh "$ROOTFS" | sed 's/^/   rootfs: /'

echo "==> [6/6] BOOT, ext4 e imagem final"
# extlinux.conf: 720p desde o kernel, sem mensagens/cursor no HDMI, CMA p/ vídeo
mtype -i "$WORK/boot.vfat" ::/extlinux/extlinux.conf \
  | sed "s#^\(\s*APPEND\s\+\)root=.*#\1$CMDLINE#" > "$WORK/extlinux.conf"
grep -q "video=HDMI-A-1:1280x720" "$WORK/extlinux.conf" || fail "extlinux.conf não ajustado"
mcopy -o -i "$WORK/boot.vfat" "$WORK/extlinux.conf" ::/extlinux/extlinux.conf
mdel -i "$WORK/boot.vfat" ::/Image.gz ::/initramfs-linux.img 2>/dev/null || true   # não usados (sem INITRD)

ROOT_BYTES=$(( SIZE_MIB * 1024 * 1024 - ROOT_START * 512 ))
fr mke2fs -q -t ext4 -L ROOT -d "$ROOTFS" "$WORK/root.ext4" "$((ROOT_BYTES / 1024))k"
e2fsck -fn "$WORK/root.ext4" >/dev/null || fail "e2fsck no rootfs"

rm -f "$IMG" "$IMG.xz"
truncate -s "${SIZE_MIB}M" "$IMG"
sfdisk -q "$IMG" <<EOF
label: dos
label-id: 0x346d1a6a
start=$BOOT_START, size=$BOOT_SECTORS, type=c, bootable
start=$ROOT_START, type=83
EOF
dd if="$WORK/bootloader.bin" of="$IMG" bs=1024 seek=8 conv=notrunc status=none
dd if="$WORK/boot.vfat" of="$IMG" bs=512 seek=$BOOT_START conv=notrunc,sparse status=none
dd if="$WORK/root.ext4" of="$IMG" bs=512 seek=$ROOT_START conv=notrunc,sparse status=none
xz -T0 -6 -f "$IMG"
( cd "$OUT" && sha256sum "$NAME.img.xz" > "$NAME.img.xz.sha256" )
echo "Imagem: $OUT/$NAME.img.xz ($(du -h "$OUT/$NAME.img.xz" | cut -f1), ${SIZE_MIB} MiB descompactada)"
cat "$OUT/$NAME.img.xz.sha256"
