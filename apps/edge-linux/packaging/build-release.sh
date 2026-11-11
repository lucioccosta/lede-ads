#!/bin/bash
# Gera o pacote OTA do Edge Linux:
#   releases/edge/sb3000-linux/lede-edge-sb3000-linux-v{X.Y.Z}.tar.zst
#
# Conteúdo (raiz do tar = raiz do release em /opt/lede-edge/releases/X.Y.Z):
#   VERSION
#   lede_edge/...
set -euo pipefail

HERE="$(cd "$(dirname "$0")/.." && pwd)"          # apps/edge-linux
REPO="$(cd "$HERE/../.." && pwd)"
VERSION="$(tr -d '[:space:]' < "$HERE/VERSION")"
OUT_DIR="${OUT_DIR:-$REPO/releases/edge/sb3000-linux}"
NAME="lede-edge-sb3000-linux-v${VERSION}.tar.zst"

if ! [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "VERSION inválida: '$VERSION'" >&2
  exit 1
fi

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

cp "$HERE/VERSION" "$STAGE/VERSION"
rsync -a --exclude '__pycache__' --exclude '*.pyc' "$HERE/lede_edge/" "$STAGE/lede_edge/"

# Sanidade: o pacote precisa compilar (sintaxe) antes de ir para os boxes
python3 -m compileall -q "$STAGE/lede_edge" >/dev/null
find "$STAGE" -name '__pycache__' -type d -prune -exec rm -rf {} +

mkdir -p "$OUT_DIR"
tar --sort=name --owner=0 --group=0 --numeric-owner --mtime="@0" \
  -C "$STAGE" -c VERSION lede_edge | zstd -19 -q -o "$OUT_DIR/$NAME" -f

echo "Pacote: $OUT_DIR/$NAME ($(du -h "$OUT_DIR/$NAME" | cut -f1))"
sha256sum "$OUT_DIR/$NAME"
