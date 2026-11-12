#!/bin/bash
# Prepara um SB3000 com Arch Linux ARM (SD) para rodar o LEDE Edge Linux.
#
#   sudo ./install.sh /caminho/lede-edge-sb3000-linux-vX.Y.Z.tar.zst
#
# Idempotente: pode rodar de novo para reparar. NÃO toca no kernel/boot
# (linux-aarch64 customizado fica em IgnorePkg); só garante cma=256M.
set -euo pipefail

PKG="${1:?uso: install.sh lede-edge-sb3000-linux-vX.Y.Z.tar.zst}"
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT=/opt/lede-edge
STATE=/var/lib/lede-edge

[ "$(id -u)" -eq 0 ] || { echo "rode como root" >&2; exit 1; }

echo "==> Dependências"
pacman -S --noconfirm --needed \
  cage seatd mesa gtk4 python python-gobject ffmpeg dosfstools rsync wlr-randr imv \
  gstreamer gst-plugins-base gst-plugins-good gst-plugins-bad gst-libav \
  gst-plugin-gtk4 gst-python grim zstd ttf-dejavu noto-fonts-emoji

echo "==> Arquivos de sistema"
install -Dm755 "$HERE/system/usr/lib/lede-edge/launch" /usr/lib/lede-edge/launch
install -Dm755 "$HERE/system/usr/lib/lede-edge/splash" /usr/lib/lede-edge/splash
install -Dm755 "$HERE/system/usr/lib/lede-edge/session" /usr/lib/lede-edge/session
install -Dm644 "$HERE/system/etc/systemd/system/lede-splash.service" /etc/systemd/system/lede-splash.service
install -Dm644 "$HERE/system/etc/modules-load.d/lede-edge.conf" /etc/modules-load.d/lede-edge.conf
install -Dm644 "$HERE/system/etc/ssh/sshd_config.d/10-lede.conf" /etc/ssh/sshd_config.d/10-lede.conf
install -Dm644 "$HERE/system/etc/systemd/system/seatd.service.d/lede-early.conf" /etc/systemd/system/seatd.service.d/lede-early.conf
install -Dm644 "$HERE/system/etc/systemd/system/lede-edge.service" /etc/systemd/system/lede-edge.service
install -Dm644 "$HERE/system/etc/systemd/network/20-wired.network" /etc/systemd/network/20-wired.network
install -Dm644 "$HERE/system/etc/systemd/network/30-halow.network" /etc/systemd/network/30-halow.network
install -Dm644 "$HERE/system/etc/systemd/system.conf.d/lede-watchdog.conf" /etc/systemd/system.conf.d/lede-watchdog.conf
if [ ! -f /etc/lede-edge/edge.conf ]; then
  install -Dm644 "$HERE/system/etc/lede-edge/edge.conf" /etc/lede-edge/edge.conf
fi

echo "==> CMA para o decoder de vídeo (cedrus precisa de memória contígua)"
EXTLINUX=/boot/extlinux/extlinux.conf
if [ -f "$EXTLINUX" ] && ! grep -qE '^\s*APPEND .*cma=' "$EXTLINUX"; then
  cp -n "$EXTLINUX" "$EXTLINUX.orig"
  sed -i '/^\s*APPEND root=/ s/$/ cma=256M/' "$EXTLINUX"
  echo "   cma=256M adicionado (efetivo após reboot)"
fi

echo "==> Splash do boot"
"$HERE/image/make-splash.sh" "$HERE/../lede_edge/assets/lede_logo.png" /usr/share/lede-edge/splash >/dev/null 2>&1 \
  || echo "   (splash não gerado — ffmpeg ausente?)"

echo "==> Release inicial"
mkdir -p "$ROOT/releases" "$STATE/ota" "$STATE/media"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
tar --zstd -xf "$PKG" -C "$TMP" --no-same-owner
VER="$(tr -d '[:space:]' < "$TMP/VERSION")"
rm -rf "$ROOT/releases/$VER"
mv "$TMP" "$ROOT/releases/$VER"
trap - EXIT
chmod 755 "$ROOT/releases/$VER"
python3 -m compileall -q "$ROOT/releases/$VER/lede_edge" >/dev/null || true
ln -sfn "releases/$VER" "$ROOT/current.new" && mv -Tf "$ROOT/current.new" "$ROOT/current"
rm -f "$STATE/ota/pending.json" "$STATE/ota/attempts"
echo "   current → $VER"

echo "==> Serviços"
systemctl daemon-reexec
systemctl enable seatd.service lede-splash.service lede-edge.service
systemctl disable getty@tty1.service 2>/dev/null || true
if [ "${SKIP_NETWORK_RELOAD:-0}" != "1" ]; then
  networkctl reload || true
fi
systemctl restart seatd.service
systemctl restart lede-edge.service
echo "OK — LEDE Edge Linux v$VER instalado. Logs: journalctl -u lede-edge -f"
