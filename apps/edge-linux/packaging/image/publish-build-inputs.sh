#!/bin/bash
# Publica os insumos do build da imagem na release `edge-sb3000-linux-image-inputs`
# (pre-release), usada pelo job "SD image" do workflow Edge SB3000 Linux Release.
#
#   publish-build-inputs.sh --base ~/MiniArch-...-SD-Image.img.xz [--pkg-cache DIR]
#
# Rode de novo sempre que o box de referência ganhar pacotes novos (depois de
# um build-image.sh online, que atualiza o cache) ou a MiniArch mudar.
set -euo pipefail

REPO="$(cd "$(dirname "$0")/../../../.." && pwd)"
TAG=edge-sb3000-linux-image-inputs
BASE="" PKG_CACHE="$REPO/releases/edge/sb3000-linux/pkgcache"
while [ $# -gt 0 ]; do
  case "$1" in
    --base) BASE="$2"; shift 2 ;;
    --pkg-cache) PKG_CACHE="$2"; shift 2 ;;
    *) echo "opção desconhecida: $1" >&2; exit 2 ;;
  esac
done
[ -f "$BASE" ] || { echo "--base (imagem MiniArch .img.xz) obrigatório" >&2; exit 2; }
case "$(basename "$BASE")" in MiniArch-*.img.xz) ;; *) echo "--base deve se chamar MiniArch-*.img.xz" >&2; exit 2 ;; esac
for d in pkgs localdb; do [ -d "$PKG_CACHE/$d" ] || { echo "cache incompleto: falta $PKG_CACHE/$d" >&2; exit 1; }; done
[ -s "$PKG_CACHE/ref-pkgs.txt" ] || { echo "cache incompleto: falta ref-pkgs.txt (rode um build online)" >&2; exit 1; }

WORK="$(mktemp -d)"; trap 'rm -rf "$WORK"' EXIT
tar -C "$PKG_CACHE" -cf "$WORK/edge-linux-pkgcache.tar" pkgs localdb ref-pkgs.txt
echo "pkgcache: $(du -h "$WORK/edge-linux-pkgcache.tar" | cut -f1)"

NOTES="Insumos do build da imagem do SD do Edge Linux (não é uma versão do app). Usados pelo workflow Edge SB3000 Linux Release."
gh release view "$TAG" >/dev/null 2>&1 \
  || gh release create "$TAG" --prerelease --title "Edge Linux — insumos da imagem" --notes "$NOTES" --target main
# Uma MiniArch só: remove bases antigas com outro nome
old_bases="$(gh release view "$TAG" --json assets -q '.assets[].name' \
  | grep '^MiniArch-.*\.img\.xz$' | grep -vxF "$(basename "$BASE")" || true)"
for old in $old_bases; do gh release delete-asset "$TAG" "$old" -y; done
gh release upload "$TAG" "$BASE" "$WORK/edge-linux-pkgcache.tar" --clobber
echo "OK: insumos publicados em $TAG"
